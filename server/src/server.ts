import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	type DocumentDiagnosticReport
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';


import { Spectral, Document, Rule } from '@stoplight/spectral-core';
import { Yaml, Json } from '@stoplight/spectral-parsers';
import * as fs from 'fs';
import { join } from 'path';
import { bundleAndLoadRuleset } from "@stoplight/spectral-ruleset-bundler/with-loader";
import minimatch from 'minimatch';
import { resolveFile } from '@stoplight/json-ref-readers';
import { Resolver, Cache } from '@stoplight/json-ref-resolver';

//Definimos un Modelo
interface LinterSettings {
	spectralRulesetsFile: string;
	validateFiles: string[];
  }

  //inicializamos con valores dummy
let settings: LinterSettings = {
	spectralRulesetsFile: '/.spectral-default.yaml',
	validateFiles: []
};

// inicializa para determinar si hay reglas definidas si no las hay
// carga las reglas minimas de un contrato openapi
const fakeFS: any = {
	promises: {
		async readFile(filepath: string) {
				if (filepath === '/.spectral-default.yaml') {
					return `extends: ["spectral:oas"]`;
				}
				return fs.promises.readFile(filepath);
			},
		},
	};

	// Crear una caché para documentos resueltos
const cache = new Cache();

// Configurar el resolver con la caché
const resolver = new Resolver({
			resolvers: {
					file: { resolve: resolveFile },
						},
			uriCache: cache
})

const spectral = new Spectral({ resolver: resolver });

// variables que se van usar localmente
let initialized = false;

// monitorea cambios en el archivo de reglas definido localmente
let watcher: fs.FSWatcher | null = null;


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
	   const workspacePath = (await connection.workspace.getWorkspaceFolders())![0].uri;
	   let localRulesetsFile = join(workspacePath, '.spectral.yml');
	   if (localRulesetsFile.startsWith('file:')) {
		 localRulesetsFile = localRulesetsFile.substring(5);
	   }       
    }else{ //en caso se cargara solo el contrato sin folder
		connection.console.log('apilinter: Se carga el contrato directamente sin folder o workspace folder .');
	}

	  // Obtener configuración de la extensión
	  settings = await connection.workspace.getConfiguration('apilinter') as LinterSettings;
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
	  } else if (watcher != null) {
		watcher.close();
		watcher = null;
	  }
	}
	// Cargar y aplicar reglas
	const customRules = await bundleAndLoadRuleset(settings.spectralRulesetsFile, {
	  fs: fakeFS,
	  fetch: globalThis.fetch,
	});
	spectral.setRuleset(customRules);
};

loadConfig();
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

/**
 * Se ejecuta antes de que el servidor esté completamente operativo. 
 * Se utiliza para determinar qué capacidades tiene el cliente y enviar una respuesta inicial.
 */
connection.onInitialize((params: InitializeParams) => {

	const result: InitializeResult = {
		capabilities: {
		  textDocumentSync: TextDocumentSyncKind.Incremental,
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
	connection.client.register(DidChangeConfigurationNotification.type, undefined);
});


/**
 * Cunado hay cambio configuracion de mi plugins
 */
connection.onDidChangeConfiguration(async change => {

	await loadConfig();
	documents.all().forEach(validateTextDocument);
});

/**
 * Para detectar cambios en los archivos de configuracion
 */
connection.onDidChangeWatchedFiles(async _change => {
	// Monitored files have change in VSCode
	//connection.console.log('Recibimos un evento de cambio de archivo.');

	await loadConfig();
	documents.all().forEach(validateTextDocument);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(async change => {
	await validateTextDocument(change.document);
});

/**
 * Se ejecuta cuando el contrato se guarda
 */
documents.onDidSave(change => {
	documents.all().forEach(async document => {
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
	async function validateTextDocument(textDocument: TextDocument): Promise<void> {

	const text = textDocument.getText();
	let diagnostics: Diagnostic[] = [];

	//console.log("settings:",settings);

	    // Dividir el texto en líneas y eliminar las que sean irrelevantes como "---"
		const lines = text.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('---'));
		// Buscar en las líneas limpias el encabezado 'openapi:'
		const containsOpenAPI = lines.some(line => line.trim().startsWith('openapi:'));

		
	if (
	  (settings.validateFiles.length == 0 && containsOpenAPI)
	  || settings.validateFiles.some(validateFile => minimatch(textDocument.uri, validateFile))
	) {
	  //const workspaceFolder = (await connection.workspace.getWorkspaceFolders())![0].uri;
	  //const filePath = textDocument.uri.substring(workspaceFolder.length + 1);

	  const workspaceFolders = await connection.workspace.getWorkspaceFolders();
	  let workspaceFolderUri = '';
	  let filePath = textDocument.uri;
  
	  if (workspaceFolders && workspaceFolders.length > 0) {
		  workspaceFolderUri = workspaceFolders[0].uri;
		  filePath = textDocument.uri.substring(workspaceFolderUri.length + 1);
	  }

	  const document = filePath.toLowerCase().endsWith('.json') ? new Document(text, Json, filePath) : new Document(text, Yaml, filePath);


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
	  }) as Diagnostic[];
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


