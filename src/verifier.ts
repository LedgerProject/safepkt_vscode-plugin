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

const exists = async (path: string): Promise<boolean> => {
	try {
		await access(path, constants.R_OK);
		return true;
	} catch (e) {
		return false;
	}
};

const promisifyVerification = (writeEmit: (m: string) => void, closeEmit: () => void, workspaceRoot: string) => {
	return new Promise<string>(async (resolve) => {
		writeEmit('✅ Started rust-based smart contract verification.\r\n');

		const backendParts: string[]|undefined = vscode.workspace
			.getConfiguration('SmartContractVerifier')
			.get('backend');


		if (!(await exists(`${workspaceRoot}/src/lib.rs`))) {
			const errorMessage = [
				'❌ Can not find smart contract expected to be readable',
				`from "${workspaceRoot}/src/lib.rs".\r\n`
			].join(" ");

			writeEmit(errorMessage);
			closeEmit();
			resolve(errorMessage);

			return;
		}
			
		if (Array.isArray(backendParts) && backendParts.length > 0) {
			const smartContractSource = fs.readFileSync(`${workspaceRoot}/src/lib.rs`, 'utf8');
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
				writeEmit(`✅ Successfully uploaded smart contract source.\r\n`);
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

			const checkingProgresss = async (progress: vscode.Progress<any>): Promise<boolean> => {
				const resp: {[index: string]: string} = await programVerificationStep(projectId, 'progress'); 
				const isVerificationOver = resp.raw_status !== 'running';

				if (isVerificationOver) {
					const resp: {[index: string]: string} = await programVerificationStep(projectId, 'report'); 

					const pattern = /([\r\n\s\S]+)VERIF[^\n\r]*([\r\n\s\S]+)/gm;

					let testResults: string = '';
					let symbolicExecution: string = '';

					let results = resp.raw_log.replace(pattern, (...args: any[]): string => {
						testResults = args[1].replaceAll(
							/([^.]+)[\.]+.+[\r\n]+/g, 
							(...a: any[]) => `${a[1]}\r\n`
						)
						.replace(/^[\.]+/g, '')
						.replace(/test\sresult[\s\S]+/g, '');

						symbolicExecution = args[2];

						const symbolicExecutionResults = symbolicExecution
							.replaceAll("\r\n", `\n`)
							.replaceAll("Tests", `\nTests`);

						return `${testResults.replaceAll("\r\n", `\n`)}\n${symbolicExecutionResults}`;
					}).replaceAll(/\n/g, `\r\n`);

					progress.report({message: 'Complete - 100%'});

					writeEmit(`${results}\r\n`);
					closeEmit();

					resolve(`${results}\r\n`);

					return true;
				}

				counter = counter + 1;

				return false;
			};

			const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				cancellable: false,
				title: 'Smart contract Verification'
			}, async (progress) => {
				while (true) {
					try {
						if (counter > 90) {
							progress.report({ message: `in progress - 90%` });
						} else {
							progress.report({ message: `in progress - ${counter}%` });
						}

						if (await checkingProgresss(progress)) {
							break;
						}

						await sleep(2000);
					} catch (e) {
						if (e instanceof Error) {
							writeEmit(`❌ ${e.message}\r\n`);
						}
					}
				}
			});
		}
	});
};

export {promisifyVerification};
