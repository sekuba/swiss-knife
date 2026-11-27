// Runs once in the browser before the app starts. Owned by the fork.
//
// @monaco-editor/react downloads the editor from cdn.jsdelivr.net by default.
// Serve the copy that selfhost/copy-monaco.mjs places in public/monaco instead,
// so no third-party script ever runs on a page that signs transactions.
import { loader } from "@monaco-editor/react";

loader.config({ paths: { vs: "/monaco/vs" } });
