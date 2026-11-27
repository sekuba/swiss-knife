// Owned by the self-hosted fork (selfhost/README.md). Upstream fetches the
// contract's ABI on the server to put its name in the page title; this build
// does no server-side work on behalf of a URL. Metadata comes from layout.tsx
// (static text, plus names from the bundled registry of well-known contracts).
import { notFound } from "next/navigation";
import { Layout } from "@/components/Layout";
import { ContractPage as ContractP } from "./ContractPage";

const ContractPage = async ({
  params,
}: {
  params: Promise<{
    address: string;
    chainId: string;
  }>;
}) => {
  const { address, chainId } = await params;
  if (!/^[1-9]\d{0,15}$/.test(chainId) || !/^0x[0-9a-fA-F]{40}$/.test(address))
    notFound();
  return (
    <Layout minW={0} allowSticky>
      <ContractP
        params={{
          address,
          chainId: parseInt(chainId),
        }}
      />
    </Layout>
  );
};
export default ContractPage;
