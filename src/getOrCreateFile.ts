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
    {isFile}: {isFile: boolean} = {isFile: true}
): Promise<vscode.TestItem> => {
    testMethods = [];

    if (isFile) {
        testController = testControllerFactory();
    }
    
    if (testController === undefined) {
        throw new Error('Invalid test controller');
    }

    const testItem = testController.createTestItem(uri.toString(), uri.path.split('/').pop()!, uri);
    testItem.canResolveChildren = true;

    testController.items.forEach((i, coll) => coll.delete(i.id));
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

        testItem.children.forEach((unitTest, col) => col.delete(unitTest.id));

        tests.map(t => {
            const startPosition: string = `${t.node.startPosition.row}:${t.node.startPosition.column}`;

            const unitTest = testController.createTestItem(startPosition, t.name, testItem.uri);

            unitTest.range = new vscode.Range(
                new vscode.Position(t.node.startPosition.row, 0),
                new vscode.Position(t.node.startPosition.row, t.node.startPosition.column
            ));

            unitTest.canResolveChildren = false;
            testItem.children.add(unitTest);

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