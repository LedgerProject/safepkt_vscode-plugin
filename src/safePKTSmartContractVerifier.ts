/*---------------------------------------------------------------------------------------------
 *  Copyright (c) CJDNS SASU. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as cp from 'child_process';

function exec(command: string, options: cp.ExecOptions): Promise<{ stdout: string; stderr: string }> {
	return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
		cp.exec(command, options, (error, stdout, stderr) => {
			if (error) {
				reject({ error, stdout, stderr });
			}

            resolve({ stdout, stderr });
		});
	});
}

function exists(file: string): Promise<boolean> {
	return new Promise<boolean>((resolve, _reject) => {
		fs.exists(file, (value) => {
			resolve(value);
		});
	});
}

interface SafePKTSmartContractVerificationTaskDefinition extends vscode.TaskDefinition {
	smartContractPath: string;
}

export class SafePKTSmartContractVerifier implements vscode.TaskProvider {
	static smartContractVerificationType = 'SafePKTSmartContractVerification';

    private tasks: vscode.Task[] | undefined;

	private sharedState: string | undefined;

	constructor(private workspaceRoot: string) { }

	public async provideTasks(): Promise<vscode.Task[]> {
		return this.getTasks();
	}

	public resolveTask(_task: vscode.Task): vscode.Task | undefined {
		const smartContractPath: string = _task.definition.smartContractPath;

        console.log({smartContractPath});

        if (smartContractPath) {
			const definition: SafePKTSmartContractVerificationTaskDefinition = <any>_task.definition;
			return this.getTask(definition.smartContractPath, definition);
		}

        return undefined;
	}

	private getTasks(): vscode.Task[] {
		if (this.tasks !== undefined) {
			return this.tasks;
		}

		const smartContractPath: string = `${this.workspaceRoot}/src/lib.rs`;

		this.tasks = [];
        this.tasks!.push(this.getTask(smartContractPath));

        return this.tasks;
	}

	private getTask(
        smartContractPath: string,
        definition?: SafePKTSmartContractVerificationTaskDefinition
    ): vscode.Task {
		if (definition === undefined) {
			definition = {
				type: SafePKTSmartContractVerifier.smartContractVerificationType,
				smartContractPath,
			};
		}

        return new vscode.Task(
            definition,
            vscode.TaskScope.Workspace,
            `Verify Smart Contract available at "${smartContractPath}"`,
			SafePKTSmartContractVerifier.smartContractVerificationType,
            new vscode.CustomExecution(async (): Promise<vscode.Pseudoterminal> => {
				// When the task is executed, this callback will run. Here, we setup for running the task.
				return new SafePKTSmartContractVerificationTaskTerminal(
                    this.workspaceRoot,
                    smartContractPath,
                    () => this.sharedState, (state: string) => this.sharedState = state
                );
			}));
	}
}

let _channel: vscode.OutputChannel;
function getOutputChannel(): vscode.OutputChannel {
	if (!_channel) {
		_channel = vscode.window.createOutputChannel('safepkt-cli auto detection');
	}
	return _channel;
}

class SafePKTSmartContractVerificationTaskTerminal implements vscode.Pseudoterminal {

    private writeEmitter = new vscode.EventEmitter<string>();
	onDidWrite: vscode.Event<string> = this.writeEmitter.event;

    private closeEmitter = new vscode.EventEmitter<number>();
	onDidClose?: vscode.Event<number> = this.closeEmitter.event;

	private fileWatcher: vscode.FileSystemWatcher | undefined;

	constructor(
        private workspaceRoot: string,
        private smartContractPath: string,
        private getSharedState: () => string | undefined,
        private setSharedState: (state: string) => void
    ) {
	}

	open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        this.doVerify();
	}

    private async doVerify(): Promise<void> {
		return new Promise<void>(async (resolve) => {
            this.writeEmitter.fire('Starting rust-based smart contract verification.\r\n');

            const binaryPathParts: string[]|undefined = vscode.workspace.getConfiguration('safePKTSmartContractVerifier').get('verifier');
            if (binaryPathParts && binaryPathParts.length > 0) {
                const command = `${binaryPathParts.join("")} verify_program --source=${this.workspaceRoot}/src/lib.rs`;

                const parts = binaryPathParts.join("").split('/');
                const parentDir = parts.slice(0, parts.length - 1);

                this.writeEmitter.fire(`=> About to run: "${command}"\r\n`);
                this.writeEmitter.fire(`=> Current working directory: "${parentDir.join("/")}"\r\n`);

                const { stdout, stderr } = await exec(command, { cwd: parentDir.join("/") });
                this.writeEmitter.fire(`${stdout} ${stderr}`);
            }

            this.closeEmitter.fire(0);

            resolve();
		});
	}

	close(): void {
		// The terminal has been closed. Shutdown the build.
		if (this.fileWatcher) {
			this.fileWatcher.dispose();
		}
	}
}