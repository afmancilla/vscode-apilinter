"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const spectral_core_1 = require("@stoplight/spectral-core");
const spectral_parsers_1 = require("@stoplight/spectral-parsers");
const fs = __importStar(require("fs"));
const path_1 = require("path");
const with_loader_1 = require("@stoplight/spectral-ruleset-bundler/with-loader");
const minimatch_1 = __importDefault(require("minimatch"));
const json_ref_readers_1 = require("@stoplight/json-ref-readers");
const json_ref_resolver_1 = require("@stoplight/json-ref-resolver");
//inicializamos con valores dummy
let settings = {
    spectralRulesetsFile: '/.spectral-default.yaml',
    validateFiles: []
};
// inicializa para determinar si hay reglas definidas si no las hay
// carga las reglas minimas de un contrato openapi
const fakeFS = {
    promises: {
        async readFile(filepath) {
            if (filepath === '/.spectral-default.yaml') {
                return `extends: ["spectral:oas"]`;
            }
            return fs.promises.readFile(filepath);
        },
    },
};
// Crear una caché para documentos resueltos
const cache = new json_ref_resolver_1.Cache();
// Configurar el resolver con la caché
const resolver = new json_ref_resolver_1.Resolver({
    resolvers: {
        file: { resolve: json_ref_readers_1.resolveFile },
    },
    uriCache: cache
});
const spectral = new spectral_core_1.Spectral({ resolver: resolver });
// variables que se van usar localmente
let initialized = false;
// monitorea cambios en el archivo de reglas definido localmente
let watcher = null;
/**
 *
 */
const loadConfig = async () => {
    //Verifica si el sistema o servidor ya ha sido inicializado. Si no, la función no procede.
    if (initialized) {
        // Obtener las carpetas de trabajo y manejar el caso de que sean null o un array vacío
        const workspaceFolders = await connection.workspace.getWorkspaceFolders();
        let localRulesetsFile = '';
        if (workspaceFolders && workspaceFolders.length > 0) {
            // local config Detectar un archivo de reglas locales
            const workspacePath = (await connection.workspace.getWorkspaceFolders())[0].uri;
            let localRulesetsFile = (0, path_1.join)(workspacePath, '.spectral.yml');
            if (localRulesetsFile.startsWith('file:')) {
                localRulesetsFile = localRulesetsFile.substring(5);
            }
        }
        else { //en caso se cargara solo el contrato sin folder
            connection.console.log('apilinter: Se carga el contrato directamente sin folder o workspace folder .');
        }
        // Obtener configuración de la extensión
        settings = await connection.workspace.getConfiguration('apilinter');
        const globalConfigFile = settings.spectralRulesetsFile;
        //Verifica si el archivo existe 
        if (fs.existsSync(localRulesetsFile)) {
            settings.spectralRulesetsFile = localRulesetsFile;
        }
        // default config 
        //Si no se encuentra un archivo de configuración válido (global o local), 
        //se usa un archivo de configuración por defecto
        if (settings.spectralRulesetsFile == null || !fs.existsSync(settings.spectralRulesetsFile)) {
            settings.spectralRulesetsFile = '/.spectral-default.yaml';
        }
        if (settings.spectralRulesetsFile == globalConfigFile) {
            // si las reglas son globales ya no es neesario monitorear
            if (watcher !== null) {
                watcher.close();
            }
            watcher = fs.watch(globalConfigFile, async () => {
                await loadConfig();
                documents.all().forEach(validateTextDocument);
            });
        }
        else if (watcher != null) {
            watcher.close();
            watcher = null;
        }
    }
    // Cargar y aplicar reglas
    const customRules = await (0, with_loader_1.bundleAndLoadRuleset)(settings.spectralRulesetsFile, {
        fs: fakeFS,
        fetch: globalThis.fetch,
    });
    spectral.setRuleset(customRules);
};
loadConfig();
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// Create a simple text document manager.
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
/**
 * Se ejecuta antes de que el servidor esté completamente operativo.
 * Se utiliza para determinar qué capacidades tiene el cliente y enviar una respuesta inicial.
 */
connection.onInitialize((params) => {
    const result = {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
        }
    };
    return result;
});
/**
 * Ejecuta acciones después de que el servidor se inicialice
 *
 */
connection.onInitialized(async () => {
    connection.console.log('apilinter loading.....');
    initialized = true;
    await loadConfig();
    documents.all().forEach(validateTextDocument);
    connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
});
/**
 * Cunado hay cambio configuracion de mi plugins
 */
connection.onDidChangeConfiguration(async (change) => {
    await loadConfig();
    documents.all().forEach(validateTextDocument);
});
/**
 * Para detectar cambios en los archivos de configuracion
 */
connection.onDidChangeWatchedFiles(async (_change) => {
    // Monitored files have change in VSCode
    //connection.console.log('Recibimos un evento de cambio de archivo.');
    await loadConfig();
    documents.all().forEach(validateTextDocument);
});
// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(async (change) => {
    await validateTextDocument(change.document);
});
/**
 * Se ejecuta cuando el contrato se guarda
 */
documents.onDidSave(change => {
    documents.all().forEach(async (document) => {
        if (document.getText().includes(change.document.uri.replace(/^.*[\\/]/, ''))) {
            cache.purge();
            await validateTextDocument(document);
        }
    });
});
/**
 * Aplica las reglas de validacion del contrato
 * @param textDocument
 * @returns
 */
async function validateTextDocument(textDocument) {
    const text = textDocument.getText();
    let diagnostics = [];
    //console.log("settings:",settings);
    // Dividir el texto en líneas y eliminar las que sean irrelevantes como "---"
    const lines = text.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('---'));
    // Buscar en las líneas limpias el encabezado 'openapi:'
    const containsOpenAPI = lines.some(line => line.trim().startsWith('openapi:'));
    if ((settings.validateFiles.length == 0 && containsOpenAPI)
        || settings.validateFiles.some(validateFile => (0, minimatch_1.default)(textDocument.uri, validateFile))) {
        //const workspaceFolder = (await connection.workspace.getWorkspaceFolders())![0].uri;
        //const filePath = textDocument.uri.substring(workspaceFolder.length + 1);
        const workspaceFolders = await connection.workspace.getWorkspaceFolders();
        let workspaceFolderUri = '';
        let filePath = textDocument.uri;
        if (workspaceFolders && workspaceFolders.length > 0) {
            workspaceFolderUri = workspaceFolders[0].uri;
            filePath = textDocument.uri.substring(workspaceFolderUri.length + 1);
        }
        const document = filePath.toLowerCase().endsWith('.json') ? new spectral_core_1.Document(text, spectral_parsers_1.Json, filePath) : new spectral_core_1.Document(text, spectral_parsers_1.Yaml, filePath);
        const issues = await spectral.run(document);
        diagnostics = issues.map(issue => {
            console.log('Process rule spectral.:', issue);
            const severidad = issue.severity + 1;
            return {
                severity: severidad,
                code: issue.code,
                range: issue.range,
                message: issue.message,
                source: 'apilinter'
            };
        });
    }
    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}
/**
 * Aquí puedes realizar alguna acción después de que el documento se cierre
 */
documents.onDidClose(e => {
    connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// Listen on the connection
connection.listen();
//# sourceMappingURL=server.js.map