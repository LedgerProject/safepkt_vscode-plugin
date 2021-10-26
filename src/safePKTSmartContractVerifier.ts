/*---------------------------------------------------------------------------------------------
 *  Copyright (c) CJDNS SASU. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as vscode from 'vscode';
import got, { CancelableRequest, Response } from 'got';
import {Base64} from 'js-base64';
import { constants } from 'fs';
import { access } from 'fs/promises';
import dummyReport from './dummyReport';

const exists = async (path: string): Promise<boolean> => {
	try {
		await access(path, constants.R_OK);
		return true;
	} catch (e) {
		return false;
	}
};

interface SafePKTSmartContractVerificationTaskDefinition extends vscode.TaskDefinition {
	smartContractPath: string;
}

export class SafePKTSmartContractVerifier implements vscode.TaskProvider {
	static smartContractVerificationType = 'Verify smart contract (requires ink! v2.1.0)';

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
            this.writeEmitter.fire('✅ Started rust-based smart contract verification.\r\n');

            const backendParts: string[]|undefined = vscode.workspace
				.getConfiguration('SmartContractVerifier')
				.get('backend');


			if (!(await exists(`${this.workspaceRoot}/src/lib.rs`))) {
				this.writeEmitter.fire([
					'❌ Can not find smart contract expected to be readable',
					`from "${this.workspaceRoot}/src/lib.rs".\r\n`
				].join(" "));
				this.closeEmitter.fire(0);
				resolve();
				return;
			}
				
			if (Array.isArray(backendParts) && backendParts.length > 0) {
				const smartContractSource = fs.readFileSync(`${this.workspaceRoot}/src/lib.rs`, 'utf8');
				const encodedSmartContractSource = Base64.encode(smartContractSource);
				const backend = backendParts.join("");
				
				const routes: {[index: string]: {path: string}} = {
					uploadSource: {
						path: '/source'
					},
					verifyProgram: {
						path: '/program-verification/{{ projectId }}'
					},
					getProgramVerificationProgress: {
						path: '/program-verification/{{ projectId }}/progress'
					},
					getProgramVerificationReport: {
						path: '/program-verification/{{ projectId }}/report'
					}
				};

				const responsePromise: CancelableRequest<Response<Buffer>> = got.post(`${backend}${routes.uploadSource.path}`, {
					json: {
						source: encodedSmartContractSource
					},
					responseType: 'json'
				});

				const response: {[index: string]: string} = await responsePromise.json();
				const projectId = response['project_id'];

				if (projectId && projectId.length > 0) {
					const verifyProgramPath = `${backend}${routes.verifyProgram.path}`.replace('{{ projectId }}', projectId);
					const responsePromise: CancelableRequest<Response<Buffer>> = got.post(verifyProgramPath, {
						responseType: 'json'
					});

					const response: {[index: string]: string} = await responsePromise.json();
            		this.writeEmitter.fire(`✅ Successfully uploaded smart contract source.\r\n`);
				}

				const programVerificationStep = async (projectId: string, stepType: string) => {
					const capitalizedFirstLetter = stepType[0].toUpperCase();
					const rest = stepType.slice(1, stepType.length);

					const capitalizedStepType = `${capitalizedFirstLetter}${rest}`;
					const routeName  = `getProgramVerification${capitalizedStepType}`;

					const path = `${backend}${routes[routeName].path}`
					.replace('{{ projectId }}', projectId);

					const responsePromise: CancelableRequest<Response<Buffer>> = got.get(path, { responseType: 'json' });
					const response: {[index: string]: string} = await responsePromise.json();

					return response;
				};

				let counter = 0;
				let intervalId: NodeJS.Timeout;

				const checkingProgresss = async (progress: vscode.Progress<any>) => {
					const resp: {[index: string]: string} = await programVerificationStep(projectId, 'progress'); 
					const isVerificationOver = resp.raw_status !== 'running';

					if (isVerificationOver) {
						const resp: {[index: string]: string} = await programVerificationStep(projectId, 'report'); 

						const pattern = /^([\s\S]*)(test\sresult:).*(\d+\spassed);\s(\d+\sfailed).*/gm;
						const results = resp.raw_log.replaceAll(pattern, (...args: any[]): string => args[0]);

						progress.report({ message: `Program verification complete - 100%` });

						this.writeEmitter.fire(`${results.replaceAll(/[\r\n]+/, "\n")}\r\n`);

						clearInterval(intervalId);

						this.closeEmitter.fire(0);
						resolve();
					}

					counter = counter + 1;
				};

				vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					cancellable: false,
					title: 'Verifying smart contract'
				}, async (progress) => {
					intervalId = setInterval(
						async () => {
							progress.report({ message: `Program verification in progress - ${counter}%` });
							await checkingProgresss(progress);
						}, 
						2000
					);
				});
			}
		});
	}

	close(): void {
		// The terminal has been closed. Shutdown the build.
		if (this.fileWatcher) {
			this.fileWatcher.dispose();
		}
	}
}