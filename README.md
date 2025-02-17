# Figma SwiftUI Code Generator

This project leverages Figma's code generation API to automatically convert Figma design nodes into SwiftUI code.

## Overview

- **Figma Integration**  
  Listens to Figma codegen events using `figma.codegen.on("generate", ...)` and generates SwiftUI code based on the selected Figma node.

- **SwiftUI Code Generation**  
  Generates SwiftUI code that reflects the design, including layouts (HStack, VStack), spacings, paddings, colors, typography, and corner radii.  
  Uses a variety of helper functions to map design properties (e.g., spacing tokens, corner radius tokens) to SwiftUI modifiers.

- **Token Mapping**  
  Maps design tokens such as spacing (none, xxxs, xxs, xs, sm, md, lg, xl, xxl, xxxl, xxxxl, full) to numeric values for spacing, padding, and corner radius.

## Project Structure

- **code.ts**  
  Contains the main code for handling Figma codegen events as well as utility functions for formatting strings and code, mapping tokens, and generating SwiftUI code.

- **Utility Functions:**  
  - `toCamelCase`: Converts strings to camelCase.
  - `indent`: Indents code with a specified number of spaces.
  - `formatTokenName` and `formatTypographyName`: Format style and typography tokens.
  - Various helper functions to extract node properties, compute spacing tokens, and generate respective SwiftUI code for different node types.

## Usage

1. **Select a Node in Figma**  
   When you select a node in Figma and run the code generation, the plugin will:
   - Extract properties (layout, colors, icons, etc.).
   - Generate SwiftUI code (e.g., for buttons, text fields, images, etc.) based on the extracted Figma design.

2. **Generate Code**  
   Run the generation event from Figma. The generated SwiftUI code will include:
   - View struct with necessary modifiers (e.g., padding, corner radius, background color).
   - Content layout using `HStack`, `VStack`, and `ScrollView` where applicable.

## Requirements

- Figma Plugin environment.
- SwiftUI (for the generated output).
- Compatible Figma document structured according to the expected properties (e.g., componentProperties on instance nodes).

## Contributing

Contributions or improvements are welcome. Ensure changes are tested within the Figma plugin context and result in valid SwiftUI code.

## License

This project is provided as-is, without warranty of any kind.