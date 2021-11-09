import * as vscode from 'vscode';
import * as Parser from 'web-tree-sitter';
import traverseTree, {TestType} from './parser';

let testMethods: {
    startsAt: string,
    name: string,
}[] = []; 

let testController: vscode.TestController;

const getOrCreateFile = async (
    uri: vscode.Uri,
    testControllerFactory: () => vscode.TestController,
    getParserTree: (source: string) => Parser.Tree,
    {isFile, refresh}: {isFile: boolean, refresh: boolean} = {isFile: true, refresh: false}
): Promise<vscode.TestItem> => {
    testMethods = [];

    if (isFile) {
        testController = testControllerFactory();
    }
    
    if (testController === undefined) {
        throw new Error('Invalid test controller');
    }

    const existing = testController.items.get(uri.toString());
    if (existing && !refresh) {
        return existing;
    }

    if (refresh && existing) {
        testController.items.forEach((i, coll) => coll.delete(i.id));
    }

    const testItem = testController.createTestItem(uri.toString(), uri.path.split('/').pop()!, uri);
    testItem.canResolveChildren = true;

    testController.items.add(testItem);

    if (isFile && typeof testController !== 'undefined') {
        let tests: TestType[] = [];

        const textDocument = await vscode.workspace.openTextDocument(uri);
        const source = textDocument.getText();
        const tree = getParserTree(source);
        
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document.uri.path === uri.path) {
                var firstLine = editor.document.lineAt(0).lineNumber;
                var lastLine = editor.document.lineAt(editor.document.lineCount - 1).lineNumber;

                tests = traverseTree(
                    tree,
                    [{
                        start: firstLine,
                        end: lastLine
                    }]
                );

                break;
            }
        }

        testItem.children.forEach((child, col) => col.delete(child.id));

        tests.map(t => {
            const unitTest = testController.createTestItem(t.name, t.name);
            unitTest.canResolveChildren = false;
            testItem.children.add(unitTest);

            const startPosition: string = `${t.node.startPosition.row}:${t.node.startPosition.column}`;

            const methodIndex = testMethods.findIndex(m => m.startsAt === startPosition);
            const method = {
                startsAt: startPosition,
                name: t.name,
            };

            if (methodIndex === -1) {
                testMethods.push(method);
                return;
            }

            testMethods[methodIndex] = method;
        });
    }

    return testItem;
};

export default getOrCreateFile;