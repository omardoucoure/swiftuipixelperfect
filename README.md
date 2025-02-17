# Figma SwiftUI Code Generator

This Figma plugin generates pixel-perfect SwiftUI views based on your Figma designs. It leverages the HAHO design system to ensure that the resulting code adheres to your design guidelines.

## Overview

- **Pixel Perfect Generation:**  
  The plugin translates your Figma designs into SwiftUI code with meticulous detail, ensuring that spacing, typography, colors, and other style properties are faithfully represented.

- **HAHO Design System Integration:**  
  The conversion process is designed around the HAHO design system. It follows the token mappings and style guidelines defined by HAHO to create consistent user interfaces.

- **SwiftUI Implementation:**  
  The generated code uses the SwiftUI version of the HAHO design system available on GitHub. This ensures that the generated views are ready for integration into your SwiftUI projects.

## Links

- **HAHO Freebie Mobile UI Kit Design System (Figma):**  
  [HAHO Freebie Mobile UI Kit Design System](https://www.figma.com/community/file/1367501339642704444/haho-freebie-mobile-ui-kit-design-system)

- **SwiftUI Version of HAHO Design System:**  
  [Velo on GitHub](https://github.com/omardoucoure/velo)

## How It Works

1. **Figma Codegen Event:**  
   The plugin listens for code generation events in Figma. When triggered, it extracts properties from the selected node (such as layout, colors, padding, corner radius, etc.) and logs relevant node data.

2. **Utility Functions:**  
   A series of utility functions format strings (camelCase conversion, indentation) and map design tokens (e.g., spacing values) to their corresponding values.

3. **SwiftUI Code Generation:**  
   Based on the type of node selected in Figma (for example, FRAME or INSTANCE), the plugin generates the corresponding SwiftUI code using components like `VeloNavigationView`, `HStack`, `VStack`, etc.  
   The output is a fully formed SwiftUI file ready for integration.

## Getting Started

1. **Install the Plugin:**  
   Import the plugin into your Figma project.

2. **Setup Your Design System:**  
   Ensure that you are using the HAHO design system in your Figma file.  
   Download the [HAHO Freebie Mobile UI Kit Design System](https://www.figma.com/community/file/1367501339642704444/haho-freebie-mobile-ui-kit-design-system) if you haven’t already.

3. **Generate SwiftUI Code:**  
   Select a node in your Figma document and trigger the code generation event. The plugin will output a SwiftUI view file that uses the SwiftUI version of the HAHO design system (Velo).

## Customization

- **Spacing & Tokens:**  
  Use the built-in mappings for spacing, padding, and corner radius tokens to control the visual details of your generated views.

- **Styling & Colors:**  
  The plugin extracts styles and color tokens from your Figma nodes to generate corresponding SwiftUI modifiers.

## Contributing

Contributions and improvements are welcome. If you have suggestions or fixes, please open an issue or submit a pull request on the GitHub repository.


---

Happy coding!