// Owned by the self-hosted fork (selfhost/README.md). Upstream looks up the
// transaction and its function name on the server to build a page title; this
// build does no server-side work on behalf of a URL, so the title is static.
import { getMetadata } from "@/utils";
import { CalldataDecoderPage as CalldataDecoderP } from "./CalldataDecoderPage";
import { metadata as layoutMetadata } from "../layout";

export const metadata = getMetadata({
  title: "Calldata Decoder | ETH.sh",
  canonical: "https://calldata.eth.sh/decoder",
  description: layoutMetadata.description as string,
  images: "https://eth.sh/api/og/calldata-decoder",
});

const CalldataDecoderPage = () => {
  return <CalldataDecoderP />;
};
export default CalldataDecoderPage;
