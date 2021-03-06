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
import {TestResults} from './testRunHandler';

const exists = async (path: string): Promise<boolean> => {
	try {
		await access(path, constants.R_OK);
		return true;
	} catch (e) {
		return false;
	}
};

const promisifyVerification = (writeEmit: (m: string) => void, closeEmit: () => void, workspaceRoot: string) => {
	return new Promise<{output: string, testResults?: TestResults}>(async (resolve) => {
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

			resolve({output: errorMessage});

			return;
		}
			
		if (Array.isArray(backendParts) && backendParts.length > 0) {
			const smartContractSource = fs.readFileSync(`${workspaceRoot}/src/lib.rs`, 'utf8');
			const encodedSmartContractSource = Base64.encode(smartContractSource);
			const backend = backendParts.join("");
			
			const routes: {[index: string]: {path: string}} = {
				getSteps: {
					path: '/steps'
				},
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

			let response: {[index: string]: string};

			try {
				response = await responsePromise.json();
			} catch (e) {
				if (e instanceof Error) {
					console.error(e);
				}

				throw e;
			}

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

					const pattern = /([\r\n\s\S]+VERIF[^\n\r]*)([\r\n\s\S]+)/gm;

					let verificationOutput: string = '';
					let symbolicExecution: string = '';

					let results = resp.raw_log.replace(pattern, (...args: any[]): string => {
						verificationOutput = args[1].replaceAll(
							/([^.]+)[\.]+.+[\r\n]+/g, 
							(...a: any[]) => `${a[1]}\r\n`
						)
						.replace(/^[\.]+/g, '')
						.replace(/test\sresult[\s\S]+/g, '');

						symbolicExecution = args[2];

						const symbolicExecutionResults = symbolicExecution
							.replaceAll("\r\n", `\n`)
							.replaceAll("Tests", `\nTests`);

						return `${verificationOutput.replaceAll("\r\n", `\n`)}\n${symbolicExecutionResults}`;
					}).replaceAll(/\n/g, `\r\n`);

					let testsResults: TestResults = [];

					const rawLog = resp.raw_log;
					let filteredOutput = '';

					rawLog.replaceAll(
						/[\r\n\s\S]+(Running\s[\r\n\s\S]+VERIFICATION_[^\n\r]*)([\r\n\s\S]+)$/gm,
						(...matches: any[]): string => {
							if (typeof matches[1] !== undefined) {
								filteredOutput = matches[1];
							}

							return matches[0];
						}
					);

					filteredOutput
						.replaceAll(
							/.+::(\S+)\s\.\.\.\s(.+)/g,
							(...args: any[]): string => JSON.stringify({ test: args[1], passed: args[2] === 'OK' }) 
						).replaceAll(
							/(\{[^\{\}]+\})/g,
							(...matches: any[]): string => {
								// Relying on side effect to populate an array of test results
								if (typeof matches[1] !== undefined) {
									testsResults.push(JSON.parse(matches[1]));
								}

								return `${matches[1]},`;
							}
						);

					// KLEE fails the test when a panic is expected 
					// by using #[should_panic] annotation
					// This is the reason why we double check if a panic is expected
					// for each test
					const expectedPanics: {test: string, expectedPanic: boolean}[] = [];
					rawLog
						.replaceAll(
							/Tests results for "([^"]+)"\s+Expected panic occurred/g,
							(...matches) => {
								expectedPanics.push({
									test: matches[1],
									expectedPanic: typeof matches[1] !== 'undefined'
								});

								if (typeof matches[1] === 'undefined') {
									return '';
								}

								return matches[1];
							}
						);

					testsResults = testsResults.map(t => {
						const panic = expectedPanics.find(p => t.test === p.test);

						if (panic) {
							t.passed = panic.expectedPanic;
							return t;
						}

						return t;
					});

					progress.report({message: 'Complete - 100%'});

					writeEmit(`raw logs:\r\n${resp.raw_log}\r\n`);
					writeEmit(`${results}\r\n`);

					closeEmit();

					resolve({output: `${results}\r\n`, testResults: testsResults});

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

export default promisifyVerification;
