import * as vscode from 'vscode';
import setUpTestController from './testController';
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

	const testControllerFactory = (): vscode.TestController => {
		const testSuite = 'smartContractTests';

		try {
			if (context.subscriptions.length === 0) {
				const testController: vscode.TestController = vscode.tests.createTestController(testSuite, 'Smart Contract Tests');
				context.subscriptions.push(testController);

				return testController;
			}

			// @ts-ignore
			return context.subscriptions.find(_ => true);
		} catch (e) {
			if (e instanceof Error) {
				console.error(e);
			}

			throw e;
		}
	};

	try {
		setUpTestController(workspaceRoot, testControllerFactory, await getParser(context));
	} catch (e) {
		if (e instanceof Error) {
			console.error(e);
		}
	}
}

export function deactivate(): void {}
