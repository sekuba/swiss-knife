// Fork-owned (selfhost/README.md): the agent skill for the Transact tool, with
// every URL pointing at this deployment instead of tx.eth.sh. The text follows
// upstream's public/tx/skill.md; selfhost/update.sh reports when that changes.
import { siteUrl } from "@/selfhost/site";

const txUrl = `${siteUrl}/tx`;
const host = new URL(siteUrl).host;

const skill = [
  "---",
  "name: eth-sh-tx",
  `description: Prepare an EVM transaction as a shareable ${host}/tx link for the user to review and execute with their wallet.`,
  "---",
  "",
  "# Prepare a transaction for the user",
  "",
  `Build a prefilled transaction URL at \`${txUrl}\` and return it to the`,
  "user. Opening the link fills the form; the user connects their wallet, reviews",
  "the transaction, and chooses whether to execute it.",
  "",
  "## URL parameters",
  "",
  "| Parameter | Meaning |",
  "| --- | --- |",
  "| `to` | Destination wallet or contract address (`0x` + 40 hex characters). |",
  "| `calldata` | ABI-encoded transaction data as `0x`-prefixed, even-length hex. Use `0x` for a plain native-currency transfer. |",
  "| `eth` | Native-currency value as a decimal string, e.g. `0.01` ETH on Ethereum. **Not wei or a token amount.** Use `0` for a nonpayable call. |",
  "| `chainId` | Decimal EVM chain ID, e.g. `1` for Ethereum or `8453` for Base. Always include it. |",
  "",
  "Provide the destination and calldata for the intended action and chain. The",
  "`eth` parameter is a decimal native-currency amount; convert from wei if needed.",
  "",
  "Construct the query with `URLSearchParams`. For example, this prepares a",
  "0.01 ETH deposit into WETH on Ethereum:",
  "",
  "```js",
  `const url = new URL("${txUrl}");`,
  "url.search = new URLSearchParams({",
  '  to: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",',
  '  calldata: "0xd0e30db0", // deposit()',
  '  eth: "0.01",',
  '  chainId: "1",',
  "}).toString();",
  "```",
  "",
  "Return the URL as a clickable link with a short explanation of the action,",
  "network, destination, and amounts. Preparing a link does not submit a transaction",
  "or grant spending permission. Keep execution with the user; never request keys",
  "or seed phrases. URL parameters are public, so do not include secrets.",
  "",
  "For contract deployment, omit `to` and put the creation bytecode followed by",
  "ABI-encoded constructor arguments in `calldata`.",
  "",
].join("\n");

export const dynamic = "force-static";

export function GET() {
  return new Response(skill, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
