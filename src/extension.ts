// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as Parser from 'web-tree-sitter';
import setUpTestController from './testController';

// For some reason this crashes if we put it inside activate
const initParser = Parser.init();

const getParser = async (context: vscode.ExtensionContext): Promise<(source: string) => Parser.Tree> => {
	await initParser;

	const wasm = `${context.extensionPath}/parsers/tree-sitter-rust.wasm`;
	const lang = await Parser.Language.load(wasm);
	const parser = new Parser();
	parser.setLanguage(lang);

	return (source: string): Parser.Tree => parser.parse(source);
};

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const workspaceRoot = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath 
		: undefined;

	if (!workspaceRoot) {
		return;
	}

	const testController = vscode.tests.createTestController('smartContractTests', 'Smart Contract Tests');
	context.subscriptions.push(testController);

	try {
		setUpTestController(workspaceRoot, testController, await getParser(context));
	} catch (e) {
		if (e instanceof Error) {
			console.error(e);
		}
	}
}

export function deactivate(): void {}
