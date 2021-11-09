import * as vscode from 'vscode';
import setUpTestController, {testControllerFactoryGetter} from './testController';
import { getParser } from './parser';

// method called when the extension is activated
// this extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const workspaceRoot = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath 
		: undefined;

	if (!workspaceRoot) {
		return;
	}

	try {
		setUpTestController(
			workspaceRoot,
			testControllerFactoryGetter(context),
			await getParser(context)
		);
	} catch (e) {
		if (e instanceof Error) {
			console.error(e);
		}
	}
}

export function deactivate(): void {}
