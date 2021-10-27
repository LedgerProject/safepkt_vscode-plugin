import * as vscode from 'vscode';
import * as path from 'path';
import {promisifyVerification} from './verifier';

const setUpTestController = (workspaceRoot: string, testController: vscode.TestController) => {
	// In this function, we'll get the file TestItem if we've already found it,
	// otherwise we'll create it with `canResolveChildren = true` to indicate it
	// can be passed to the `controller.resolveHandler` to gets its children.
	const getOrCreateFile = (uri: vscode.Uri): vscode.TestItem => {
		const existing = testController.items.get(uri.toString());
		if (existing) {
			return existing;
		}
	
		const testItem = testController.createTestItem(uri.toString(), uri.path.split('/').pop()!, uri);
		testItem.canResolveChildren = true;
	
		testController.items.add(testItem);

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
				watcher.onDidChange(uri => parseTestsInFileContents(getOrCreateFile(uri)));

				// And, finally, delete TestItems for removed files. This is simple, since
				// we use the URI as the TestItem's ID.
				watcher.onDidDelete(uri => testController.items.delete(uri.toString()));
			
				for (const file of await vscode.workspace.findFiles(pattern)) {
					getOrCreateFile(file);
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
  
	const parseTestsInDocument = (e: vscode.TextDocument) => {
		if (e.uri.scheme === 'file' && e.uri.path.endsWith('.rs')) {
			parseTestsInFileContents(getOrCreateFile(e.uri), e.getText());
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
					const testItem = getOrCreateFile(res);

					run.started(testItem);
					run.appendOutput(
						"✅ Started smart contract verification",
						new vscode.Location(res, new vscode.Position(0, 0)), 
						testItem
					);

					const verificationResults = await promisifyVerification(() => {}, () => {}, workspaceRoot);

					run.passed(testItem, Date.now() - start);
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