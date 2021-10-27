// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import setUpTestController from './testController';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const workspaceRoot = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath 
		: undefined;

	if (!workspaceRoot) {
		return;
	}

	const testController = vscode.tests.createTestController('smartContractTests', 'Smart Contract Tests');
	context.subscriptions.push(testController);

	try {
		setUpTestController(workspaceRoot, testController);
	} catch (e) {
		if (e instanceof Error) {
			console.error(e);
		}
	}
}

export function deactivate(): void {}
