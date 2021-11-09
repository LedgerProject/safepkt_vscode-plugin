import * as vscode from 'vscode';
import * as Parser from 'web-tree-sitter';
import getOrCreateFile from './getOrCreateFile';
import runHandler from './testRunHandler';

let testController: vscode.TestController;

const setUpTestController = (
	workspaceRoot: string,
	testControllerFactory: () => vscode.TestController,
	getParserTree: (source: string) => Parser.Tree
) => {
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
				watcher.onDidCreate(async uri => await getOrCreateFile(
					uri,
					testControllerFactory,
					getParserTree
				));

				// When files change, re-parse them. Note that you could optimize this so
				// that you only re-parse children that have been resolved in the past.
				watcher.onDidChange(async (uri) => {
					parseTestsInFileContents(await getOrCreateFile(
							uri,
							testControllerFactory,
							getParserTree,
							{isFile: false, refresh: false}
						)
					);
					for (const file of await vscode.workspace.findFiles(pattern)) {
						await getOrCreateFile(
							file,
							testControllerFactory,
							getParserTree,
							{isFile: true, refresh: false}
						);
					}
				});

				// And, finally, delete TestItems for removed files. This is simple, since
				// we use the URI as the TestItem's ID.
				watcher.onDidDelete(uri => testController.items.delete(uri.toString()));
			
				for (const file of await vscode.workspace.findFiles(pattern)) {
					await getOrCreateFile(
						file,
						testControllerFactory,
						getParserTree,
						{isFile: true, refresh: false}
					);
				}
		
				return watcher;
			})
		);
	};
	
	testController = testControllerFactory();

	testController.resolveHandler = async test => {
		if (!test) {
			await discoverAllFilesInWorkspace();
		} else {
			await parseTestsInFileContents(test);
		}
	};
  
	const parseTestsInDocument = async (e: vscode.TextDocument, refresh: boolean = false) => {
		if (e.uri.scheme === 'file' && e.uri.path.endsWith('.rs')) {
			parseTestsInFileContents(
				await getOrCreateFile(
					e.uri,
					testControllerFactory,
					getParserTree,
					{refresh, isFile: true}
				),
				e.getText()
			);
		}
	};
	
	// When text documents are open, parse tests in them.
	vscode.workspace.onDidOpenTextDocument(parseTestsInDocument);
	
	// We could also listen to document changes to re-parse unsaved changes:
	vscode.workspace.onDidChangeTextDocument(e => parseTestsInDocument(e.document, true));

	testController.createRunProfile(
		'Run smart contract verification',
		vscode.TestRunProfileKind.Run,
		async (request: vscode.TestRunRequest, token: vscode.CancellationToken) => {
			await runHandler(
				workspaceRoot,
				testController,
				testControllerFactory,
				getParserTree,
				false,
				request,
				token
			);
		},
		true
	);
};

export default setUpTestController;