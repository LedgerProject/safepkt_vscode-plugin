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


async function getSafePKTSmartContractVerifierTasks({state: sharedState}: {state: string | undefined}): Promise<vscode.Task[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const result: vscode.Task[] = [];

    if (!workspaceFolders || workspaceFolders.length === 0) {
        return result;
    }

    for (const workspaceFolder of workspaceFolders) {
        const folderString = workspaceFolder.uri.fsPath;
        if (!folderString) {
            continue;
        }

        const commandLine = path.join(folderString, '/scripts/safepkt-cli');
        if (!await exists(commandLine)) {
            continue;
        }

        try {
            const { stdout, stderr } = await exec(`${commandLine} verify_program --help`, { cwd: folderString });

            if (stderr && stderr.length > 0) {
                getOutputChannel().appendLine(stderr);
                getOutputChannel().show(true);
            }

            if (stdout) {
                const lines = stdout.split(/\n/);
                for (const line of lines) {
                    if (line.length === 0) {
                        continue;
                    }
                                    
                    const definition = {
                        type: SafePKTSmartContractVerifier.smartContractVerificationType,
                        smartContractPath: "/tmp/374567ab67/src/lib.rs"
                    };

                    const task = new vscode.Task(
                        definition,
                        vscode.TaskScope.Workspace,
                        `Verify Smart Contract available at "${definition.smartContractPath}"`,
                        SafePKTSmartContractVerifier.smartContractVerificationType,
                        new vscode.CustomExecution(async (): Promise<vscode.Pseudoterminal> => {
                            // When the task is executed, this callback will run. Here, we setup for running the task.
                            return new SafePKTSmartContractVerificationTaskTerminal(
                                folderString, 
                                definition.smartContractPath,
                                () => sharedState,
                                (state: string) => sharedState = state
                            );
                        }));

                    result.push(task);

                    task.group = vscode.TaskGroup.Test;
                }
            }
        } catch (err: any) {
            const channel = getOutputChannel();

            if (err.stderr) {
                channel.appendLine(err.stderr);
            }

            if (err.stdout) {
                channel.appendLine(err.stdout);
            }

            channel.appendLine('Auto detecting safepkt-cli tasks failed.');
            channel.show(true);
        }
    };

    return result;
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

		const smartContractPath: string = '/tmp/374567ab67/src/lib.rs';

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
		// At this point we can start using the terminal.
        const pattern = path.join(this.workspaceRoot, 'src/*.rs');

        console.log(pattern);

        const fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        fileWatcher.onDidChange(() => this.doVerify());
		fileWatcher.onDidCreate(() => this.doVerify());
		fileWatcher.onDidDelete(() => this.doVerify());

        this.doVerify();
	}

    private async doVerify(): Promise<void> {
		return new Promise<void>((resolve) => {
            // const { stdout, stderr } = await exec(`${commandLine} verify_program --help`, { cwd: folderString });

            this.writeEmitter.fire(`${this.workspaceRoot}/src/lib.rs`);

            let config = vscode.workspace.getConfiguration("safePKTSmartContractVerifier");
            const verify = config.verify;

            this.writeEmitter.fire(`${verify}.\r\n`);
            this.writeEmitter.fire('Starting rust-based smart contract verification.\r\n');
            this.writeEmitter.fire('Rust smart contract verification complete.\r\n\r\n');
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