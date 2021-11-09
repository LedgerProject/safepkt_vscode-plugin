import * as vscode from 'vscode';
import * as Parser from 'web-tree-sitter';

let nodeTypes: {
	node: any,
	text: string,
	parent: {
		node: Parser.SyntaxNode,
		type: string
	}
}[] = [];

type TestType = {
	node: Parser.SyntaxNode,
	name: string,
	expectedPanic: boolean
};

// For some reason this crashes if we put it inside activate
const initParser = Parser.init();

const getParser = async (context: vscode.ExtensionContext): Promise<(source: string) => Parser.Tree> => {
	await initParser;

	const wasm = `${context.extensionPath}/parsers/tree-sitter-rust.wasm`;
	const lang = await Parser.Language.load(wasm);
	const parser = new Parser();
	parser.setLanguage(lang);

	return (source: string): Parser.Tree => parser.parse(source);
};

// See https://github.com/georgewfraser/vscode-tree-sitter/blob/471169a992a8222329f9649e7e15f5c42d9097a1/src/colors.ts
function visible(x: Parser.TreeCursor, visibleRanges: { start: number, end: number }[]) {
	for (const { start, end } of visibleRanges) {
		const overlap = x.startPosition.row <= end + 1 && start - 1 <= x.endPosition.row;
		if (overlap) {
			return true;
		}
	}

	return false;
}

export function traverseTree(
	root: Parser.Tree,
	visibleRanges: {start: number, end: number}[]
): TestType[] {
	let visitedChildren = false;
	let cursor: Parser.TreeCursor = root.walk();
	nodeTypes = [];

	let parents = [{
		node: cursor.currentNode(),
		type: cursor.nodeType
	}];

	while (true) {
		// Advance cursor
		if (visitedChildren) {
			if (cursor.gotoNextSibling()) {
				visitedChildren = false;
			} else if (cursor.gotoParent()) {
				parents.pop();
				visitedChildren = true;
				continue;
			} else {
				break;
			}
		} else {
			const parent = cursor.nodeType;
			if (cursor.gotoFirstChild()) {
				parents.push({
					node: cursor.currentNode(),
					type: parent
				});
				visitedChildren = false;
			} else {
				visitedChildren = true;
				continue;
			}
		}

		if (!visible(cursor, visibleRanges)) {
			visitedChildren = true;
			continue;
		}

		const parent = parents[parents.length - 1];

		if (
			cursor.nodeType === 'attribute_item' &&
			(nodeTypes.find(
				n => // Both node text and current syntax node should have not been found before
					n.text === cursor.nodeText && 
					n.node === cursor.currentNode()
			) === undefined)
		) {
			nodeTypes.push({
				node: cursor.currentNode(),
				text: cursor.nodeText,
				parent
			});
		}
	}

	const tests: TestType[] = nodeTypes
	.filter(n => n.text === '#[test]')
	.map(n => {
		let expectedPanic = false;
		if (n.node.nextSibling.text === '#[should_panic]') {
			expectedPanic = true;
		}

		let nextSibling = n.node.nextSibling;
		if (expectedPanic) {
			nextSibling = n.node.nextSibling.nextSibling;
		}

		const name = nextSibling.text.replace(/fn\s+([^\(\)]+)\([\s\S]*/g, (...args: any[]): string => {
			return args[1];
		});

		return {
			node: n.node,
			name,
			expectedPanic
		};
	});

	cursor.delete();

	return tests;
}

export type {TestType};

export {getParser};

export default traverseTree;