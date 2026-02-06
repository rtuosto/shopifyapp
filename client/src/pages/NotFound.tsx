import { Link } from "wouter";
import { Page, Box, BlockStack, Text, Button } from "@shopify/polaris";

export default function NotFound() {
  return (
    <Page>
      <Box padding="600" >
        <BlockStack gap="600" align="center">
          <Text as="h1" variant="heading3xl" tone="subdued">404</Text>
          <BlockStack gap="200" align="center">
            <Text as="h2" variant="headingLg">Page Not Found</Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              The page you're looking for doesn't exist.
            </Text>
          </BlockStack>
          <Link href="/">
            <Button variant="primary" data-testid="button-home">
              Back to Dashboard
            </Button>
          </Link>
        </BlockStack>
      </Box>
    </Page>
  );
}
