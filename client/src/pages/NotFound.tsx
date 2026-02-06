import { Link } from "wouter";

export default function NotFound() {
  return (
    <s-page>
      <s-box padding="large-400" style={{ textAlign: 'center' }}>
        <s-stack direction="block" gap="large" align="center">
          <s-text variant="heading3xl" tone="subdued">404</s-text>
          <s-stack direction="block" gap="small" align="center">
            <s-text variant="headingLg">Page Not Found</s-text>
            <s-text variant="bodyMd" tone="subdued">
              The page you're looking for doesn't exist.
            </s-text>
          </s-stack>
          <Link href="/">
            <s-button variant="primary" icon="home" data-testid="button-home">
              Back to Dashboard
            </s-button>
          </Link>
        </s-stack>
      </s-box>
    </s-page>
  );
}
