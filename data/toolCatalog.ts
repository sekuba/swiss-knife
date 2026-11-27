// Owned by the self-hosted fork (selfhost/README.md): the tools this build
// ships. Upstream's catalog lists every eth.sh tool; this one lists three.
import subdomains from "@/subdomains";
import { subdomainToInfo } from "./subdomainToInfo";

export type ToolCatalogEntry = {
  subdomain: string;
  path?: string;
  info: {
    emoji: string;
    label: string;
    description: string;
    isRelativePath?: boolean;
  };
};

export const toolEntries: ToolCatalogEntry[] = [
  {
    subdomain: subdomains.CONTRACT.base,
    info: { ...subdomainToInfo[subdomains.CONTRACT.base], label: "Explorer" },
  },
  {
    subdomain: subdomains.CALLDATA.base,
    path: "decoder",
    info: subdomainToInfo[subdomains.CALLDATA.base],
  },
  {
    subdomain: subdomains.TRANSACT.base,
    info: subdomainToInfo[subdomains.TRANSACT.base],
  },
];

export const toolCategories: {
  id: string;
  label: string;
  tools: ToolCatalogEntry[];
}[] = [{ id: "tools", label: "Tools", tools: toolEntries }];
