// Owned by the self-hosted fork (selfhost/README.md): a plain index of the
// tools this build ships, in place of upstream's marketing homepage.
"use client";

import { Box, Heading, Link, SimpleGrid, Text } from "@chakra-ui/react";
import { Layout } from "@/components/Layout";
import { toolEntries } from "@/data/toolCatalog";
import { toolHref } from "@/lib/toolNavigation";

const Home = () => (
  <Layout minW={0} allowSticky>
    <Box w="full" maxW="960px" mx="auto" py={{ base: 6, md: 12 }}>
      <Heading as="h1" size="lg" color="text.primary" mb={6}>
        Tools
      </Heading>
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
        {toolEntries.map((tool) => (
          <Link
            key={`${tool.subdomain}/${tool.path ?? ""}`}
            href={toolHref(tool)}
            p={5}
            bg="bg.subtle"
            border="1px solid"
            borderColor="border.default"
            borderRadius="lg"
            _hover={{ borderColor: "primary.500", textDecoration: "none" }}
          >
            <Text fontSize="lg" fontWeight="semibold" color="text.primary" mb={2}>
              {tool.info.label}
            </Text>
            <Text fontSize="sm" color="text.secondary">
              {tool.info.description}
            </Text>
          </Link>
        ))}
      </SimpleGrid>
    </Box>
  </Layout>
);

export default Home;
