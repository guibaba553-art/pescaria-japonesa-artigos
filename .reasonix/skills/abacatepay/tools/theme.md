# Theme

## What is the AbacatePay Theme?

The **AbacatePay Theme** is the **official theme of AbacatePay**, designed to provide a consistent, comfortable, and productive visual experience in **modern development environments**.

It follows a **green-first** approach, aligned with AbacatePay's visual identity, focusing on:

- Prolonged reading without fatigue
- Balanced contrast
- Semantic code highlighting
- Consistency across editors

### When to use the AbacatePay Theme?
- You want **visual consistency** between tools
- You work long hours in the editor
- You value **strong visual identity** in your setup
- You prefer clean, modern themes without excessive color

## Supported Editors

The theme is officially maintained for the following editors:

- **VS Code**: Official theme published in the Marketplace.
- **IntelliJ / JetBrains**: Native schemes without needing a plugin.
- **Neovim**: Full support with variations and Lualine.

## Installation

### VS Code

Install directly from the Marketplace:

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "AbacatePay Theme"
4. Click Install

Or via command line:

```bash
code --install-extension abacatepay.abacatepay-theme
```

### IntelliJ / JetBrains

1. Open your JetBrains IDE (IntelliJ IDEA, WebStorm, etc.)
2. Go to File > Settings > Editor > Color Scheme
3. Click the gear icon and select "Import Scheme"
4. Choose "IntelliJ IDEA color scheme (.icls)" from the AbacatePay Theme repository
5. Apply and restart

### Neovim

For Neovim, use the theme via your preferred plugin manager:

```lua
-- Using Packer
use 'abacatepay/abacatepay-theme-nvim'

-- Configuration
require('abacatepay-theme').setup({
  style = 'dark', -- or 'light'
  transparent = false
})
```

## Customization

The theme supports basic customization through editor settings:

### VS Code

Add to your `settings.json`:

```json
{
  "workbench.colorTheme": "AbacatePay",
  "editor.tokenColorCustomizations": {
    "[AbacatePay]": {
      "comments": "#64748b"
    }
  }
}
```

### Neovim

```lua
vim.cmd('colorscheme abacatepay')
vim.g.abacatepay_transparent = true
```

## Color Palette

The theme uses a carefully crafted green-based palette:

- **Background**: Dark green tones for comfort
- **Foreground**: High contrast text
- **Accent**: Green highlights for keywords and functions
- **Syntax**: Balanced colors for different token types

## Contributing

The theme is open source and contributions are welcome:

- Report issues on the GitHub repository
- Suggest improvements or new editor support
- Contribute code for better editor compatibility

## Related Resources

- [AbacatePay Ecosystem](../ecosystem) — See the full ecosystem.
- [Official Repository](https://github.com/abacatepay/theme) — Source code and issues.

## Official Documentation

For installation in other editors and customization options, see [AbacatePay Theme Docs](https://docs.abacatepay.com/ecosystem/theme).</content>
<parameter name="filePath">/home/albqvxc/www/abacatepay/skills/tools/theme.md