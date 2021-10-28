import * as vscode from 'vscode';
import {promisifyVerification} from './verifier';
import * as Parser from 'web-tree-sitter';

// See https://github.com/georgewfraser/vscode-tree-sitter/blob/471169a992a8222329f9649e7e15f5c42d9097a1/src/colors.ts
function visible(x: Parser.TreeCursor, visibleRanges: { start: number, end: number }[]) {
	for (const { start, end } of visibleRanges) {
		const overlap = x.startPosition.row <= end + 1 && start - 1 <= x.endPosition.row;
		if (overlap) {
			return true;
		}
	}

	return false;
}

export type Range = {start: Parser.Point, end: Parser.Point};

type TestType = {
	node: Parser.SyntaxNode,
	name: string,
	expectedPanic: boolean
};

const nodeTypes: {
	node: any,
	text: string,
	parent: {
		node: Parser.SyntaxNode,
		type: string
	}
}[] = [];

export function traverseTree(
	root: Parser.Tree,
	visibleRanges: {start: number, end: number}[]
): TestType[] {
	let visitedChildren = false;
	let cursor: Parser.TreeCursor = root.walk();

	let parents = [{
		node: cursor.currentNode(),
		type: cursor.nodeType
	}];

	while (true) {
		// Advance cursor
		if (visitedChildren) {
			if (cursor.gotoNextSibling()) {
				visitedChildren = false;
			} else if (cursor.gotoParent()) {
				parents.pop();
				visitedChildren = true;
				continue;
			} else {
				break;
			}
		} else {
			const parent = cursor.nodeType;
			if (cursor.gotoFirstChild()) {
				parents.push({
					node: cursor.currentNode(),
					type: parent
				});
				visitedChildren = false;
			} else {
				visitedChildren = true;
				continue;
			}
		}

		if (!visible(cursor, visibleRanges)) {
			visitedChildren = true;
			continue;
		}

		const parent = parents[parents.length - 1];

		if (cursor.nodeType === 'attribute_item') {
			nodeTypes.push({
				node: cursor.currentNode(),
				text: cursor.nodeText,
				parent
			});
		} 
	}

	const tests: TestType[] = nodeTypes
	.filter(n => n.text === '#[test]')
	.map(n => {
		let expectedPanic = false;
		if (n.node.nextSibling.text === '#[should_panic]') {
			expectedPanic = true;
		}

		let nextSibling = n.node.nextSibling;
		if (expectedPanic) {
			nextSibling = n.node.nextSibling.nextSibling;
		}

		const name = nextSibling.text.replace(/fn\s+([^\(\)]+)\([\s\S]*/g, (...args: any[]): string => {
			return args[1];
		});

		return {
			node: n.node,
			name,
			expectedPanic
		};
	});

	cursor.delete();

	return tests;
}

const setUpTestController = (
	workspaceRoot: string,
	testController: vscode.TestController,
	getParser: (source: string) => Parser.Tree
) => {
	const getOrCreateFile = async (uri: vscode.Uri, {isFile}: {isFile: boolean} = {isFile: true}): Promise<vscode.TestItem> => {
		const existing = testController.items.get(uri.toString());
		if (existing) {
			return existing;
		}
	
		const testItem = testController.createTestItem(uri.toString(), uri.path.split('/').pop()!, uri);
		testItem.canResolveChildren = true;
	
		testController.items.add(testItem);

		if (isFile) {
			let tests: TestType[] = [];

			const textDocument = await vscode.workspace.openTextDocument(uri);
			const source = textDocument.getText();
		    const tree = getParser(source);
			for (const editor of vscode.window.visibleTextEditors) {
				if (editor.document.uri.path === uri.path) {
					var firstLine = editor.document.lineAt(0).lineNumber;
					var lastLine = editor.document.lineAt(editor.document.lineCount - 1).lineNumber;

					tests = traverseTree(
						tree,
						[{
							start: firstLine,
							end: lastLine
						}]
					);

					break;
				}
			}

			tests.map(t => {
				const unitTest = testController.createTestItem(t.name, t.name);
				unitTest.canResolveChildren = false;
				testItem.children.add(unitTest);
			});
		}

		return testItem;
  	};

	const parseTestsInFileContents = async (file: vscode.TestItem, contents?: string) => {
		// If a document is open, VS Code already knows its contents. If this is being
		// called from the resolveHandler when a document isn't open, we'll need to
		// read them from disk ourselves.
		if (contents === undefined && file.uri) {
			const rawContent = await vscode.workspace.fs.readFile(file.uri);
			contents = new TextDecoder().decode(rawContent);
		}
	
		file.error = undefined;
	};
	
	const discoverAllFilesInWorkspace = async () => {
		if (!vscode.workspace.workspaceFolders) {
			return []; // handle the case of no open folders
		}
	  
		return Promise.all(
			vscode.workspace.workspaceFolders.map(async workspaceFolder => {
				const pattern = new vscode.RelativePattern(workspaceFolder, 'src/*.rs');
				const watcher = vscode.workspace.createFileSystemWatcher(pattern);
			
				// When files are created, make sure there's a corresponding "file" node in the tree
				watcher.onDidCreate(uri => getOrCreateFile(uri));

				// When files change, re-parse them. Note that you could optimize this so
				// that you only re-parse children that have been resolved in the past.
				watcher.onDidChange(async (uri) => parseTestsInFileContents(await getOrCreateFile(uri)));

				// And, finally, delete TestItems for removed files. This is simple, since
				// we use the URI as the TestItem's ID.
				watcher.onDidDelete(uri => testController.items.delete(uri.toString()));
			
				for (const file of await vscode.workspace.findFiles(pattern)) {
					getOrCreateFile(file, {isFile: true});
				}
		
				return watcher;
			})
		);
	};
	
	testController.resolveHandler = async test => {
		if (!test) {
			await discoverAllFilesInWorkspace();
		} else {
			await parseTestsInFileContents(test);
		}
	};
  
	const parseTestsInDocument = async (e: vscode.TextDocument) => {
		if (e.uri.scheme === 'file' && e.uri.path.endsWith('.rs')) {
			parseTestsInFileContents(await getOrCreateFile(e.uri), e.getText());
		}
	};
	
	// When text documents are open, parse tests in them.
	vscode.workspace.onDidOpenTextDocument(parseTestsInDocument);
	
	// We could also listen to document changes to re-parse unsaved changes:
	vscode.workspace.onDidChangeTextDocument(e => parseTestsInDocument(e.document));

	const runHandler = async (
		shouldDebug: boolean,
		request: vscode.TestRunRequest,
		token: vscode.CancellationToken
	) => {
        const start = Date.now();
		const run = testController.createTestRun(
			new vscode.TestRunRequest(),
			'Symbolic Execution Run',
			false
		);

		try {
			await (async () => {
				const pattern = new vscode.RelativePattern(workspaceRoot, 'src/*.rs');
				for (const res of await vscode.workspace.findFiles(pattern)) {
					const testItem = await getOrCreateFile(res);

					run.started(testItem);
					run.appendOutput(
						"✅ Started smart contract verification",
						new vscode.Location(res, new vscode.Position(0, 0)), 
						testItem
					);

					const verificationResults = await promisifyVerification(() => {}, () => {}, workspaceRoot);

					const endedAt = Date.now() - start;
					run.passed(testItem, endedAt);

					testItem.children.forEach(childTestItem => {
						const childRun = testController.createTestRun(
							new vscode.TestRunRequest(),
							childTestItem.label,
							false
						);

						childRun.started(childTestItem);
						childRun.passed(childTestItem, endedAt);
						childRun.end();
					});

					run.appendOutput(
						verificationResults,
						new vscode.Location(res, new vscode.Position(0, 0)), 
						testItem
					);
				}
			})();
		} catch (e) {
			if (e instanceof Error) {
				console.error(e);
			}
		}

		run.end();
	};
	  
	testController.createRunProfile(
		'Run smart contract verification',
		vscode.TestRunProfileKind.Run,
		async (request, token) => {
			await runHandler(false, request, token);
		},
		true
	);
};

export default setUpTestController;