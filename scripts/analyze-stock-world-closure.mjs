#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const walk = require('internal/deps/acorn/acorn-walk/dist/walk');

const sourcePath = path.resolve(process.argv[2] || '');
if (!sourcePath || !fs.existsSync(sourcePath)) {
    console.error('Usage: node --expose-internals scripts/analyze-stock-world-closure.mjs /path/to/app.js');
    process.exit(2);
}

const source = fs.readFileSync(sourcePath, 'utf8');
const ast = acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    locations: true,
    ranges: true,
    allowHashBang: true
});

const declarations = new Map();
const declarationNodes = [];

function patternNames(node, names = []) {
    if (!node) return names;
    if (node.type === 'Identifier') names.push(node.name);
    else if (node.type === 'RestElement') patternNames(node.argument, names);
    else if (node.type === 'AssignmentPattern') patternNames(node.left, names);
    else if (node.type === 'ArrayPattern') node.elements.forEach(item => patternNames(item, names));
    else if (node.type === 'ObjectPattern') node.properties.forEach(property => {
        if (property.type === 'RestElement') patternNames(property.argument, names);
        else patternNames(property.value, names);
    });
    return names;
}

for (const node of ast.body) {
    let names = [];
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
        if (node.id) names = [node.id.name];
    } else if (node.type === 'VariableDeclaration') {
        names = node.declarations.flatMap(declaration => patternNames(declaration.id));
    }
    if (!names.length) continue;
    const record = {
        node,
        names,
        start: node.start,
        end: node.end,
        startLine: node.loc.start.line,
        endLine: node.loc.end.line,
        text: source.slice(node.start, node.end),
        refs: new Set()
    };
    declarationNodes.push(record);
    for (const name of names) declarations.set(name, record);
}

function isReference(identifier, ancestors) {
    const parent = ancestors.at(-2);
    if (!parent) return true;
    if ((parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression')
        && (parent.id === identifier || parent.params.includes(identifier))) return false;
    if ((parent.type === 'ClassDeclaration' || parent.type === 'ClassExpression') && parent.id === identifier) return false;
    if (parent.type === 'VariableDeclarator' && parent.id === identifier) return false;
    if (parent.type === 'MemberExpression' && parent.property === identifier && !parent.computed) return false;
    if (parent.type === 'Property' && parent.key === identifier && !parent.computed && !parent.shorthand) return false;
    if (parent.type === 'MethodDefinition' && parent.key === identifier && !parent.computed) return false;
    if (parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') return false;
    if (parent.type === 'CatchClause' && parent.param === identifier) return false;
    return true;
}

for (const record of declarationNodes) {
    walk.ancestor(record.node, {
        Identifier(node, ancestors) {
            if (!isReference(node, ancestors)) return;
            if (declarations.has(node.name) && !record.names.includes(node.name)) record.refs.add(node.name);
        }
    });
}

const seedRanges = [
    [1452, 1465],
    [2726, 3506],
    [4011, 4627],
    [8362, 9624],
    [11926, 32300],
    [39684, 39807]
];

const seedRecords = declarationNodes.filter(record =>
    seedRanges.some(([start, end]) => record.startLine >= start && record.startLine <= end)
    || record.names.some(name => /World/.test(name) && !/VideoWorld|CompanionSocialWorld/.test(name))
);

const selectedRecords = new Set(seedRecords);
const queue = [...seedRecords];
while (queue.length) {
    const record = queue.shift();
    for (const reference of record.refs) {
        const dependency = declarations.get(reference);
        if (!dependency || selectedRecords.has(dependency)) continue;
        selectedRecords.add(dependency);
        queue.push(dependency);
    }
}

const selected = [...selectedRecords].sort((a, b) => a.start - b.start);
const totalLines = selected.reduce((sum, record) => sum + record.endLine - record.startLine + 1, 0);
const seededNames = new Set(seedRecords.flatMap(record => record.names));
const dependencyOnly = selected.filter(record => !record.names.some(name => seededNames.has(name)));

console.log(JSON.stringify({
    source: sourcePath,
    topLevelDeclarationRecords: declarationNodes.length,
    seedRecords: seedRecords.length,
    closureRecords: selected.length,
    closureLinesIncludingOverlap: totalLines,
    dependencyOnlyRecords: dependencyOnly.length,
    dependencyOnly: dependencyOnly.map(record => ({
        names: record.names,
        startLine: record.startLine,
        endLine: record.endLine
    })),
    selected: selected.map(record => ({
        names: record.names,
        startLine: record.startLine,
        endLine: record.endLine,
        seeded: record.names.some(name => seededNames.has(name))
    }))
}, null, 2));
