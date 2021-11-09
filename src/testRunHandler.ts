import * as vscode from 'vscode';
import * as Parser from 'web-tree-sitter';
import promisifyVerification from './verifier';
import getOrCreateFile from './getOrCreateFile';

type TestResult = {
	test: string,
	passed: boolean
};
type TestResults = TestResult[];

const isPassingTest = (
    testItem: vscode.TestItem,
    testResult: TestResult|undefined,
    testRun: vscode.TestRun,
    testFailureMessage: vscode.TestMessage,
    endedAt: number
): boolean => {
    if (typeof testResult === 'undefined' || !testResult.passed) {
        testRun.failed(testItem, testFailureMessage, endedAt);
        return false;
    } 

    testRun.passed(testItem, endedAt);
    return true;
};
  
const runHandler = async (
    workspaceRoot: string,
    testController: vscode.TestController,
    testControllerFactory: () => vscode.TestController,
    getParserTree: (source: string) => Parser.Tree,
    shouldDebug: boolean,
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
) => {
    const run = testController.createTestRun(
        new vscode.TestRunRequest(),
        'Symbolic Execution Run',
        false
    );

    try {
        await (async () => {
            const pattern = new vscode.RelativePattern(workspaceRoot, 'src/*.rs');
            for (const res of await vscode.workspace.findFiles(pattern)) {
                const start = Date.now();
                const testItem = await getOrCreateFile(
                    res,
                    testControllerFactory,
                    getParserTree,
                    {isFile: true}
                );

                run.started(testItem);
                run.appendOutput(
                    "✅ Started smart contract verification",
                    new vscode.Location(res, new vscode.Position(0, 0)), 
                    testItem
                );

                const verificationResults = await promisifyVerification(() => {}, () => {}, workspaceRoot);
                const endedAt = Date.now() - start;

                let failingTests = 0;

                testItem.children.forEach(fileUnderTest => {
                    const childRun = testController.createTestRun(
                        new vscode.TestRunRequest(),
                        fileUnderTest.label,
                        false
                    );

                    childRun.started(fileUnderTest);

                    const testFailureMessage = new vscode.TestMessage(`"${fileUnderTest.label}" has failed`);

                    if (typeof verificationResults.testResults === 'undefined') {
                        childRun.failed(testItem, testFailureMessage, endedAt);
                        failingTests = failingTests + 1;
                    } else {
                        const testResult = verificationResults.testResults
                        .find((i: TestResult) => i.test === fileUnderTest.label);
                
                        const passingTest = isPassingTest(
                            fileUnderTest,
                            testResult,
                            childRun,
                            testFailureMessage,
                            endedAt
                        );

                        if (!passingTest) {
                            failingTests = failingTests + 1;								
                        }
                    }

                    childRun.end();
                });

                run.appendOutput(
                    verificationResults.output,
                    new vscode.Location(res, new vscode.Position(0, 0)), 
                    testItem
                );

                if (failingTests > 0) {
                    run.failed(testItem, new vscode.TestMessage("Some tests failed..."), endedAt);
                
                    return;
                }

                run.passed(testItem, endedAt);
            }
        })();
    } catch (e) {
        if (e instanceof Error) {
            console.error(e);
        }
    }

    run.end();
};

export type {TestResult, TestResults};

export default runHandler;