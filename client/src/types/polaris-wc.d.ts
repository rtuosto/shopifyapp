declare namespace JSX {
  interface IntrinsicElements {
    's-page': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      size?: 'base' | 'large';
      'primary-action'?: string;
    }, HTMLElement>;
    's-section': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      padding?: string;
      heading?: string;
      collapsible?: boolean;
    }, HTMLElement>;
    's-heading': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      variant?: string;
      accessibilityRole?: string;
    }, HTMLElement>;
    's-text': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      variant?: 'headingXs' | 'headingSm' | 'headingMd' | 'headingLg' | 'headingXl' | 'heading2xl' | 'heading3xl' | 'bodyXs' | 'bodySm' | 'bodyMd' | 'bodyLg';
      tone?: 'base' | 'subdued' | 'disabled' | 'success' | 'critical' | 'caution' | 'magic' | 'text-inverse';
      fontWeight?: 'regular' | 'medium' | 'semibold' | 'bold';
      alignment?: 'start' | 'center' | 'end' | 'justify';
      textDecorationLine?: 'line-through';
      truncate?: boolean;
    }, HTMLElement>;
    's-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      variant?: 'primary' | 'secondary' | 'tertiary' | 'plain' | 'monochrome-plain';
      tone?: 'critical' | 'success';
      size?: 'slim' | 'medium' | 'large' | 'micro';
      icon?: string;
      disabled?: boolean;
      loading?: boolean;
      href?: string;
      target?: string;
      fullWidth?: boolean;
      accessibilityLabel?: string;
      textAlign?: 'start' | 'center' | 'end';
    }, HTMLElement>;
    's-button-group': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      gap?: string;
      variant?: 'segmented';
    }, HTMLElement>;
    's-badge': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      tone?: 'info' | 'success' | 'warning' | 'critical' | 'attention' | 'new' | 'read-only' | 'enabled';
      size?: 'small' | 'medium' | 'large';
      progress?: 'incomplete' | 'partial' | 'complete';
      icon?: string;
    }, HTMLElement>;
    's-banner': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      tone?: 'info' | 'success' | 'warning' | 'critical';
      dismissible?: boolean;
      heading?: string;
      onDismiss?: () => void;
    }, HTMLElement>;
    's-spinner': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      size?: 'small' | 'large';
      accessibilityLabel?: string;
    }, HTMLElement>;
    's-text-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      label?: string;
      value?: string;
      defaultValue?: string;
      type?: string;
      placeholder?: string;
      disabled?: boolean;
      readOnly?: boolean;
      error?: string;
      helpText?: string;
      prefix?: string;
      suffix?: string;
      maxLength?: number;
      min?: string;
      max?: string;
      step?: string;
      autoComplete?: string;
      name?: string;
      labelAccessibilityVisibility?: 'hidden' | 'visible' | 'exclusive';
      onInput?: (e: Event) => void;
      onChange?: (e: Event) => void;
      onFocus?: (e: Event) => void;
      onBlur?: (e: Event) => void;
    }, HTMLElement>;
    's-number-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      label?: string;
      value?: string;
      defaultValue?: string;
      min?: string;
      max?: string;
      step?: string;
      disabled?: boolean;
      error?: string;
      helpText?: string;
      name?: string;
      onInput?: (e: Event) => void;
      onChange?: (e: Event) => void;
    }, HTMLElement>;
    's-select': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      label?: string;
      value?: string;
      defaultValue?: string;
      disabled?: boolean;
      error?: string;
      helpText?: string;
      name?: string;
      labelAccessibilityVisibility?: 'hidden' | 'visible' | 'exclusive';
      onChange?: (e: Event) => void;
    }, HTMLElement>;
    's-choice-list': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      label?: string;
      values?: string[];
      allowMultiple?: boolean;
      onChange?: (e: Event) => void;
    }, HTMLElement>;
    's-checkbox': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      label?: string;
      checked?: boolean;
      defaultChecked?: boolean;
      disabled?: boolean;
      error?: string;
      helpText?: string;
      onChange?: (e: Event) => void;
    }, HTMLElement>;
    's-switch': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      label?: string;
      checked?: boolean;
      defaultChecked?: boolean;
      disabled?: boolean;
      onChange?: (e: Event) => void;
    }, HTMLElement>;
    's-textarea': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      label?: string;
      value?: string;
      defaultValue?: string;
      placeholder?: string;
      disabled?: boolean;
      error?: string;
      helpText?: string;
      name?: string;
      rows?: number;
      onInput?: (e: Event) => void;
      onChange?: (e: Event) => void;
    }, HTMLElement>;
    's-stack': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      direction?: 'block' | 'inline';
      gap?: string;
      align?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly' | 'stretch';
      blockAlign?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
      wrap?: boolean;
      display?: 'auto' | 'none';
    }, HTMLElement>;
    's-grid': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      columns?: string;
      rows?: string;
      gap?: string;
      areas?: string;
    }, HTMLElement>;
    's-box': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      background?: string;
      border?: string;
      borderColor?: string;
      borderRadius?: string;
      borderWidth?: string;
      display?: string;
      padding?: string;
      paddingBlock?: string;
      paddingBlockStart?: string;
      paddingBlockEnd?: string;
      paddingInline?: string;
      paddingInlineStart?: string;
      paddingInlineEnd?: string;
      inlineSize?: string;
      blockSize?: string;
      minInlineSize?: string;
      maxInlineSize?: string;
      minBlockSize?: string;
      maxBlockSize?: string;
      overflow?: 'visible' | 'hidden';
      accessibilityRole?: string;
    }, HTMLElement>;
    's-divider': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      borderColor?: string;
      borderWidth?: string;
    }, HTMLElement>;
    's-link': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      href?: string;
      target?: string;
      monochrome?: boolean;
      accessibilityLabel?: string;
    }, HTMLElement>;
    's-clickable': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      href?: string;
      target?: string;
      disabled?: boolean;
    }, HTMLElement>;
    's-progress-bar': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      progress?: number;
      tone?: 'info' | 'success' | 'primary' | 'critical';
      size?: 'small' | 'medium' | 'large';
      animated?: boolean;
      accessibilityLabel?: string;
    }, HTMLElement>;
    's-tabs': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      onTabChange?: (e: Event) => void;
    }, HTMLElement>;
    's-tab': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      selected?: boolean;
      disabled?: boolean;
      badge?: string;
    }, HTMLElement>;
    's-menu': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      id?: string;
    }, HTMLElement>;
    's-menu-item': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      disabled?: boolean;
      destructive?: boolean;
    }, HTMLElement>;
    's-modal': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      id?: string;
      heading?: string;
      open?: boolean;
      variant?: 'base' | 'small' | 'large' | 'fullscreen';
    }, HTMLElement>;
    's-modal-actions': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    's-search-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      label?: string;
      value?: string;
      placeholder?: string;
      disabled?: boolean;
      onInput?: (e: Event) => void;
      onChange?: (e: Event) => void;
      onClear?: (e: Event) => void;
    }, HTMLElement>;
    's-query-container': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      queryname?: string;
    }, HTMLElement>;
    'ui-nav-menu': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    'ui-title-bar': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      title?: string;
    }, HTMLElement>;
  }
}
