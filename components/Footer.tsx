// Owned by the self-hosted fork (selfhost/README.md).
import { Box, Container, Link as ChakraLink, Text } from "@chakra-ui/react";

const UPSTREAM_REPO = "https://github.com/swiss-knife-xyz/swiss-knife";
// Where this build's source is published; falls back to upstream.
const SOURCE_URL = process.env.NEXT_PUBLIC_SOURCE_URL || UPSTREAM_REPO;

export const Footer = () => (
  <Box
    as="footer"
    mt={10}
    bg="bg.base"
    py={6}
    borderTop="1px"
    borderColor="border.subtle"
  >
    <Container maxW="container.xl" px={{ base: 4, md: 6 }}>
      <Text color="text.secondary" fontSize="sm" textAlign="center">
        Self-hosted, reduced build of{" "}
        <ChakraLink href="https://eth.sh" isExternal color="text.primary">
          ETH.sh
        </ChakraLink>{" "}
        by the Swiss-Knife contributors (MIT). Not affiliated with eth.sh.{" "}
        <ChakraLink href={SOURCE_URL} isExternal color="text.primary">
          Source
        </ChakraLink>
      </Text>
    </Container>
  </Box>
);
