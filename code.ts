const SKIPPED_NODE_NAMES = ["Top App Bar", "Interaction State", "Bottom App Bar"];

figma.codegen.on("generate", async (event) => {
  const node = event.node;
  if (!node) return [createErrorResult("No valid node selected.")];
  if (node.type === "INSTANCE") {
    const mainComponentId = await node.getMainComponentAsync();
    // console.log(node.componentProperties);
    console.log(mainComponentId);
  }

  console.log({
    name: node.name,
    type: node.type,
    // mainComponentId: "mainComponent" in node ? mainComponentId : "N/A",
    layoutMode: "layoutMode" in node ? node.layoutMode : "N/A",
    layoutAlign: "layoutAlign" in node ? node.layoutAlign : "N/A",
    parentLayoutAlign: node.parent && "layoutAlign" in node.parent ? node.parent.layoutAlign : "N/A",
    constraints: "constraints" in node ? node.constraints : "N/A"
  });

  try {
    const swiftUICode = await generateSwiftUICode(node);

    return [{
      language: "SWIFT",
      code: swiftUICode,
      title: `${sanitizeName(node.name)}View.swift`,
    }];
  } catch (error) {
    console.error(error);
    return [createErrorResult("Error generating SwiftUI code.")];
  }
});

async function extractTokenFromTextNode(node: TextNode): Promise<string> {
  if (!node.boundVariables?.fills?.[0]) return "";
  const boundFill = node.boundVariables.fills[0];
  
  if (boundFill && "id" in boundFill) {
    const variable = await figma.variables.getVariableByIdAsync(boundFill.id);
    return variable ? formatTokenName(variable.name) : "";
  }

  return "";
}

function createErrorResult(message: string): CodegenResult {
  return {
    language: "PLAINTEXT",
    code: message,
    title: "Codegen Error",
  };
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "");
}

async function getZIndex(node: SceneNode): Promise<number | null> {
  if (!node.parent) {
      console.error(`Node "${node.name}" has no parent.`);
      return null;
  }

  // If the parent is a PageNode, it needs to be explicitly loaded
  if (node.parent.type === "PAGE") {
      await (node.parent as PageNode).loadAsync();
  }

  // Ensure the parent supports children
  if (!("children" in node.parent)) {
      console.error(`Node "${node.name}" is not inside a valid parent (Frame, Group, etc.).`);
      return null;
  }

  const layers = node.parent.children; // Get all sibling layers
  const zIndex = layers.indexOf(node); // Find the position in the stack

  if (zIndex === -1) {
      console.error(`Node "${node.name}" was not found in its parent's children.`);
      return null;
  }

  console.log(`Layer Name: ${node.name}, Z-Index: ${zIndex}`);
  return zIndex;
}

async function getTypographyProperties(node: SceneNode): Promise<string> {
  if (node.type !== "TEXT" || !node.textStyleId) return "";
  const textStyle = await figma.getStyleByIdAsync(node.textStyleId as string);
  return formatTypographyName(textStyle?.name || "");
}

function formatStyleToken(styleName: string, tokenPrefix: string): string {
  const tokenName = styleName
    .toLowerCase()
    .replace(/[\s-]/g, ".")
    .replace(/[()]/g, "")
    .replace(/\//g, ".");
  return `${tokenPrefix}.token.${tokenName}`;
}

function getNodeColor(node: SceneNode): string | null {
  if (!("fills" in node) || !Array.isArray(node.fills) || !node.fills.length) return ".clear";
  
  const firstFill = node.fills[0] as SolidPaint;
  if (firstFill?.type !== "SOLID") return ".clear";

  if ("fillStyleId" in node && node.fillStyleId) {
    const style = figma.getStyleById(node.fillStyleId as string);
    if (style) {
      return formatStyleToken(style.name, "Color");
    }
  }

  const { r, g, b } = firstFill.color;
  const hex = [r, g, b]
    .map(c => Math.round(c * 255).toString(16).padStart(2, "0"))
    .join("");
  return `Color(hex: "#${hex}")`;
}

function getCornerRadiusToken(node: SceneNode): string | null {
  if (!("cornerRadius" in node) || typeof node.cornerRadius !== "number" || node.cornerRadius === 0) return null;
  if (node.parent === null) return null;

  if ("cornerStyleId" in node && node.cornerStyleId) {
    const style = figma.getStyleById(node.cornerStyleId as string);
    if (style) {
      return formatStyleToken(style.name, "CornerRadius");
    }
  }
  return `.cornerRadius(${node.cornerRadius})`;
}

function getPaddingValues(node: SceneNode): string {
  if (node.parent === null) {
    return "";
  }

  if (!("paddingLeft" in node)) return "";

  const { paddingLeft = 0, paddingRight = 0, paddingTop = 0, paddingBottom = 0 } = node;
  const modifiers: string[] = [];

  if (paddingLeft === paddingRight && paddingLeft === paddingTop && paddingLeft === paddingBottom && paddingLeft > 0) {
    return `.padding(${paddingLeft}) `;
  }

  if (paddingLeft === paddingRight && paddingTop === paddingBottom) {
    if (paddingLeft > 0) modifiers.push(`.padding(.horizontal, ${paddingLeft})`);
    if (paddingTop > 0) modifiers.push(`.padding(.vertical, ${paddingTop})`);
  } else {
    if (paddingLeft > 0) modifiers.push(`.padding(.leading, ${paddingLeft})`);
    if (paddingRight > 0) modifiers.push(`.padding(.trailing, ${paddingRight})`);
    if (paddingTop > 0) modifiers.push(`.padding(.top, ${paddingTop})`);
    if (paddingBottom > 0) modifiers.push(`.padding(.bottom, ${paddingBottom})`);
  }

  return modifiers.join("\n");
}

function isWidthFill(node: SceneNode): boolean {
  // 1️⃣ Check if node is inside Auto Layout
  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    if ("layoutAlign" in node && node.layoutAlign === "STRETCH") {
      return true; // Directly "Fill"
    }

    // 2️⃣ If node's layoutAlign is "INHERIT", check parent's layoutAlign safely
    if ("layoutAlign" in node && node.layoutAlign === "INHERIT" && node.parent && "layoutAlign" in node.parent) {
      return node.parent.layoutAlign === "STRETCH";
    }
  }

  // 3️⃣ Check constraints for Non-Auto Layout nodes
  if ("constraints" in node) {
    return node.constraints.horizontal === "SCALE";
  }

  return false; // Default case
}

async function getSwiftUIFrame(node: SceneNode): Promise<string> {
  let isButton = false;

  // 1️⃣ Check if the node is an instance of a Button component
  if (node.type === "INSTANCE") {
    const mainComponent = await node.getMainComponentAsync();
    if ((mainComponent && mainComponent.id.split(":")[0] === "159") || (mainComponent && mainComponent.id.split(":")[0] === "119")) {
      isButton = true;
    }
  }

  // 2️⃣ Check if the width is set to "Fill"
  const isFillWidth = isWidthFill(node);

  // 3️⃣ Apply maxWidth only if it's a Button and "Fill"
  if (isButton && isFillWidth) {
    return `.infinity`;
  } else if (isFillWidth) {
    return `.frame(maxWidth: .infinity`;
  }

  return "nil";
}

async function generateSwiftUICode(node: SceneNode): Promise<string> {
  const sanitizedName = sanitizeName(node.name);
  const bodyContent = await generateBodyContent(node, true);
  const indentedBodyContent = indent(bodyContent, 12);

  return `import SwiftUI

struct ${sanitizedName}View: View {
    @StateObject private var navigationState = VeloNavigationState(title: "${node.name}", hasSearchBar: false)
    
    init() {
        VeloFont.registerFonts()
    }
    
    var body: some View {
        VeloNavigationView {
${indentedBodyContent}
              .padding(.sm)
          }
          .frame(maxWidth: 600)
        .environmentObject(navigationState)
    }
}

#Preview {
    ${sanitizedName}View()
}`;
}

async function getComponentType(node: InstanceNode): Promise<string> {
  const mainComponent = await node.getMainComponentAsync();
  if (!mainComponent) return "Container";
  
  const [prefix, suffix] = mainComponent.id.split(":");
  
  const componentMap: Record<string, string> = {
    "119": "Button",
    "159": "Button",
    "152": "Badge",
    "161": "SegmentedControl",
    "125": "InputField",
    "153": "Checkbox",
    "171": "Divider",
    "104": "Icon",
    "17": "Image",
    "352": "Image"
  };
  
  if (prefix === "171") {
    const componentMap171: Record<string, string> = {
      "3056": "Avatar",
      "3064": "Divider",
      "3684": "Leading Item",
      "3676": "Leading Item",
      "3693": "Trailing Item"
    };
    return componentMap171[suffix] || "Container";
  }
  
  if (prefix === "104") {
    const componentMap104: Record<string, string> = {
      "925": "Icon"
    };
    return componentMap104[suffix] || "Container";
  }
  
  return componentMap[prefix] || "Container";
}

async function generateBodyContent(node: SceneNode, isRoot: boolean = false): Promise<string> {
  if (node.type !== "FRAME" || SKIPPED_NODE_NAMES.includes(node.name)) return "";
  
  const frameNode = node as FrameNode;
  if (!frameNode.children) return "";

  const hasFrameChild = frameNode.children.some(
    child => child.type === "FRAME" && !SKIPPED_NODE_NAMES.includes(child.name)
  );

  const content = [];
  for (let i = 0; i < frameNode.children.length; i++) {
    const child = frameNode.children[i];
    if (SKIPPED_NODE_NAMES.includes(child.name)) continue;

    content.push(await generateNodeContent(child, false)); 
    if (i < frameNode.children.length - 1 && hasSpacer(frameNode)) {
      content.push("Spacer()");
    }
  }

  var stackType = isHorizontalLayout(node) ? "HStack" : "VStack";
  let zIndex = 0;   
  if (isItemSpacingNegative(node)) {
    return `${stackType}(spacing: -50) {\n  ${content.join("\n")}\n }\n`;
  }

  const modifiers = [
    !isRoot ? getPaddingValues(node) : null,
    getNodeColor(node) && `.background(${getNodeColor(node)})`,
    !isRoot ? getCornerRadiusToken(node) : null,
    `.zIndex(${zIndex})`,
  ].filter(Boolean);

  if (isRoot) {
    return `ScrollView {\n${content.join("\n")}\n}${modifiers.length ? "\n" + modifiers.join("\n") : ""}`;
  }
  let spacing = isItemSpacingNegative(node) ? "-50" : `${node.itemSpacing}`;

  if (hasFrameChild) {
    return `${stackType}(spacing: ${spacing}) {\n  ${content.join("\n")}\n}${modifiers.length ? "\n" + modifiers.join("\n") : ""}\n`;
  }

  const color = getNodeColor(node);
  const backgroundParam = color ? `, background: ${color}` : "";

  return `${stackType}(spacing: ${spacing}) {\n  ${content.join("\n")}\n}${modifiers.length ? "\n" + modifiers.join("\n") : ""}\n`;
}

function hasSpacer(node: FrameNode): boolean {
  return node.layoutMode === "HORIZONTAL" && node.primaryAxisAlignItems === "SPACE_BETWEEN";
}

function isHorizontalLayout(node: SceneNode): boolean {
  return node.type === "FRAME" && "layoutMode" in node && node.layoutMode === "HORIZONTAL";
}

function isItemSpacingNegative(node: SceneNode): boolean {
  if (node.type === "FRAME" && "itemSpacing" in node) {
    return node.itemSpacing < 0;
  }

  return false;
}

async function generateNodeContent(node: SceneNode, isRoot: boolean): Promise<string> {
  // If no parent is available (null), the node is root
  if (!node.parent) {
    isRoot = true;
  }
  const generators: Record<string, (node: any, isRoot?: boolean) => Promise<string>> = {
    FRAME: generateBodyContent,
    INSTANCE: generateInstanceContent,
    GROUP: generateGroupContent,
    TEXT: generateTextContent,
    RECTANGLE: (n) => Promise.resolve(generateShapeContent(n, "Rectangle")),
    ELLIPSE: (n) => Promise.resolve(generateShapeContent(n, "Circle")),
    VECTOR: (n) => Promise.resolve(generateShapeContent(n, "VectorShape")),
    LINE: (n) => Promise.resolve(`Separator()`),
  };

  return (generators[node.type] || (() => Promise.resolve(`// Unhandled node type: ${node.type}`)))(node, isRoot);
}

async function generateInstanceContent(node: InstanceNode): Promise<string> {
  if (node.name.includes("List")) {
    const listRowProps = await generateListRowProps(node);
    return `ListRow(itemViewModel: RowViewModel(${listRowProps})) \n`;
  }

  const componentType = await getComponentType(node);
  if (componentType === "Button") {
    return generateButtonContent(node);
  }

  if (componentType === "Badge") {
    const badgeText = getTextFromChild(node, "Badge label");
    return `BadgeView(text: "${badgeText}", backgroundColor: .infoFocus) \n`;
  }

  if (componentType === "SegmentedControl") {
    const segments = node.children
      .map((child, index) => {
        const text = getTextFromChild(child, "Button");
        return `"${text}"`;
      });

    return `SegmentedPicker(
        [${segments.join(", ")}],
        selectedItem: .constant(${segments[0]})
    ) { segment in
        Text(segment)
            .font(.textRegularSemiBold)
            .frame(maxWidth: .infinity, alignment: .center)
            // .foregroundColor(selectedSegment == segment ? .textNeutral05 : .textNeutral9)
            .padding(.vertical, 10)
    } \n`;
  }

  if (componentType === "InputField") {
    return generateInputField(node);
  }

  if (componentType === "Checkbox") {
    return `CheckboxView(isChecked: .constant(false)) \n`;
  }

  if (componentType === "Icon") {
    const iconName = toCamelCase(node.children[0].name);
    return `Icon(imageName: .${iconName}) \n`;
  }

  if (componentType === "Image") {
    const iconName = toCamelCase(node.name);
    return `Image(veloAsset: .${iconName}) \n`;
  }

  if (componentType === "Divider") {
    return `Separator().padding(.vertical, .xs) \n`;
  }

  if (componentType === "Leading Item" || componentType === "Trailing Item") {
    return `${await getLeadingItem(node)} \n`;
  }

  return `Text("${node.name}") \n`;
}

async function getPropertyValue(node: InstanceNode, propertyKey: string): Promise<string> {
  const properties = node.componentProperties;

  // Find the full key that starts with the given propertyKey
  const fullKey = Object.keys(properties).find(key => key.startsWith(propertyKey));

  if (!fullKey) {
    return "nil"; // Return "nil" if no matching key exists
  }

  const property = properties[fullKey];

  // ✅ If it's a BOOLEAN and TRUE, find the corresponding INSTANCE_SWAP key
  if (property.type === "BOOLEAN" && property.value === true) {
    const relatedSwapKey = Object.keys(properties).find(
      key => key.startsWith(propertyKey) && properties[key].type === "INSTANCE_SWAP"
    );

    if (relatedSwapKey) {
      const componentId = properties[relatedSwapKey].value as string;
      const componentNode = await figma.getNodeByIdAsync(componentId) as ComponentNode | InstanceNode;

      if (componentNode) {
        return `Image(veloAsset: .${componentNode.name})`;
      }
      return componentId; // Return the ID if we couldn't resolve the name
    }

    return "nil"; // Return "true" if no related swap property is found
  }

  // ✅ If it's an INSTANCE_SWAP, return the component's name instead of the ID
  if (property.type === "INSTANCE_SWAP" && typeof property.value === "string") {
    const componentNode = await figma.getNodeByIdAsync(property.value) as ComponentNode | InstanceNode;
    return componentNode ? `Image(veloAsset: .${componentNode.name})` : `nil`;
  }

  if (property.type === "VARIANT" && typeof property.value === "string") {
    const mainComponent = await node.getMainComponentAsync();
    const componentNode = await figma.getNodeByIdAsync(property.value) as ComponentNode | InstanceNode;
    return componentNode ? `Image(veloAsset: .${componentNode.name})` : `FF`;
  }

  // ✅ Return other property values as strings
  return `nil`;
}

function extractIconProperties(
  properties: Record<string, any>,
  leftKeySearch: string = "Content Left",
  centerKeySearch: string = "Button",
  rightKeySearch: string = "Icon Right"
) {
  const iconLeftKey = Object.keys(properties).find(key => key.includes(leftKeySearch));
  const iconCenterKey = Object.keys(properties).find(key => key.includes(centerKeySearch));
  const iconRightKey = Object.keys(properties).find(key => key.includes(rightKeySearch));
  const iconLeftSwapKey = Object.keys(properties).find(key => key.includes("Icon-Left"));
  const iconCenterSwapKey = Object.keys(properties).find(key => key.includes("Button"));
  const iconRightSwapKey = Object.keys(properties).find(key => key.includes("Icon-Right"));

  return {
    hasIconLeft: !!iconLeftKey && properties[iconLeftKey].value === true,
    hasIconCenter: !!iconCenterKey && properties[iconCenterKey].value === true,
    hasIconRight: !!iconRightKey && properties[iconRightKey].value === true,
    iconLeftName:
      iconLeftSwapKey && typeof properties[iconLeftSwapKey].value === "string"
        ? properties[iconLeftSwapKey].value
        : null,

        iconCenterName:
      iconCenterSwapKey && typeof properties[iconCenterSwapKey].value === "string"
        ? properties[iconCenterSwapKey].value
        : null,
    iconRightName:
      iconRightSwapKey && typeof properties[iconRightSwapKey].value === "string"
        ? properties[iconRightSwapKey].value
        : null,
  };
}

async function generateButtonContent(node: InstanceNode): Promise<string> {
  const properties = node.componentProperties;
  const { hasIconLeft, hasIconCenter, hasIconRight, iconLeftName, iconCenterName, iconRightName } = extractIconProperties(properties, "Content Left", "Icon Right");
  const buttonText = getTextFromChild(node, "Button");

  const iconLeftPart =
    hasIconLeft && iconLeftName
      ? `iconLeft: .${toCamelCase(await getTextFromComponentID(node, iconLeftName))},`
      : "";

      const iconCenterPart = node.children[0].type === "INSTANCE"
        ? `iconCenter: .${toCamelCase(node.children[0].name)},`
        : "";
        if (node.children[0].type === "INSTANCE") {
          console.log(node.children[0].name);

        }

  const iconRightPart =
    hasIconRight && iconRightName
      ? `iconRight: .${toCamelCase(await getTextFromComponentID(node, iconRightName))},`
      : "";


  const buttonStyle = ".filled"; // You can add dynamic logic here if needed
  const isDisabled = "false"; // Default, change based on Figma settings

  return `VeloButton(
      ${buttonText ? `"${buttonText}",` : ""}
      background: ${getNodeColor(node)},
      style: ${buttonStyle},
      ${iconLeftPart}
      ${iconCenterPart}
      ${iconRightPart}
      isDisabled: ${isDisabled},
      maxWidth: ${await getSwiftUIFrame(node)},
      action: {}
  )`;
}

async function generateInputField(node: InstanceNode): Promise<string> {
  const properties = node.componentProperties;

  const iconLeftKey = Object.keys(properties).find(key => key.includes("Icon Left"));
  const iconRightKey = Object.keys(properties).find(key => key.includes("Icon Right"));
  const iconLeftSwapKey = Object.keys(properties).find(key => key.includes("Icon-Left"));
  const iconRightSwapKey = Object.keys(properties).find(key => key.includes("Icon-Right"));

  // Extract values safely
  const hasIconLeft = iconLeftKey ? properties[iconLeftKey].value === true : false;
  const hasIconRight = iconRightKey ? properties[iconRightKey].value === true : false;

  const iconLeftName = iconLeftSwapKey && typeof properties[iconLeftSwapKey].value === "string"
    ? properties[iconLeftSwapKey].value
    : null;

  const iconRightName = iconRightSwapKey && typeof properties[iconRightSwapKey].value === "string"
    ? properties[iconRightSwapKey].value
    : null;

  return `CustomTextField(
      text: .constant("${getTextFromChild(node, "Text")}"),
      placeholder: "",
      isEmail: false,
      iconRight: ${await getPropertyValue(node, "Icon Right")},
      iconLeft: ${await getPropertyValue(node, "Icon Left")}
  )`;
}

async function generateGroupContent(node: SceneNode): Promise<string> {
  if (!("children" in node) || !node.children) return "";

  const content = await Promise.all(node.children.map(child => generateNodeContent(child, false)));

  return `VStack(spacing: .md) /* ${node.name} */ {\n${content.join("\n")}\n}`;
}

function generateShapeContent(node: SceneNode, shape: string): string {
  const color = getNodeColor(node) || "Color.gray";
  return `${shape}().fill(${color})`;
}

async function generateTextContent(node: TextNode): Promise<string> {
  const typography = await getTypographyProperties(node);
  const textColor = await extractTokenFromTextNode(node);
  
  return `Text("${node.characters}")
    .font(.${typography})
    .foregroundColor(.${textColor})
    .opacity(${node.opacity})
    .frame(maxWidth: .infinity, alignment: .${getTextPosition(node)}) \n`;
}

function getTextFromChild(node: SceneNode, childName: string): string {
  if (!("children" in node) || !node.children) return "";

  for (const child of node.children) {
    if (child.name === childName && child.type === "TEXT") {
      return child.characters;
    }
    if ("children" in child) {
      const nestedResult = getTextFromChild(child, childName);
      if (nestedResult) return nestedResult;
    }
  }
  return "";
}

async function getTextFromComponentID(node: SceneNode, componentID: string): Promise<string> {
  if (!("children" in node) || !node.children) return "";

  for (const child of node.children) {
    if (child.type === "INSTANCE") {
      const mainComponent = await child.getMainComponentAsync();
      if (mainComponent?.id === componentID) {
        return child.name;
      }
    }
  }
  return "";
}

function getTextPosition(node: TextNode): "leading" | "trailing" | "center" | "unknown" {
  if (!node.parent || node.parent.type !== "FRAME") {
    return "leading";
  }

  const parentFrame = node.parent as FrameNode;

  if (parentFrame.layoutMode !== "HORIZONTAL") {
    return "leading";
  }

  const siblings = parentFrame.children.filter(child => child.type === "TEXT") as TextNode[];

  const index = siblings.indexOf(node);
  if (index === -1) return "leading";

  if (index === 0) {
    return "leading";
  } else if (index === siblings.length - 1) {
    return "trailing";
  }

  if (node.textAlignHorizontal === "CENTER") {
    return "center";
  }

  return "leading";
}

async function generateListRowProps(node: SceneNode): Promise<string> {
  const textFields = ["Overline", "Headline", "Supporting Text", "Meta Data"];
  const props = textFields
    .map(field => {
      const value = getTextFromChild(node, field);
      return value ? `${toCamelCase(field)}: "${value}"` : null;
    })
    .filter(Boolean);

  if (node.type === "INSTANCE") {
    const leadingItem = findLeadingItem(node);
    console.log(leadingItem);
    if (leadingItem && "children" in leadingItem && leadingItem.children)  {
      const test = leadingItem.children[0];
      if (test && "children" in test && test.children)  {
        const button = test.children[0].name;
        props.push(`leadingItem: .icon(imageName: .${toCamelCase(button)})`);

      } else {
        if (leadingItem) {
        props.push(`leadingItem: .icon(imageName: .${toCamelCase(test.name)})`);
        }
      }
    }
  }
  props.push("divider: true");
  return props.join(",\n               ");
}

function findLeadingItem(node: SceneNode): SceneNode | null {
  if (node.name.trim().toLowerCase().includes("leading item")) {
    return node;
  }

  if ("children" in node) {
    for (const child of node.children) {
      const found = findLeadingItem(child);
      if (found)
        return found;
    }
  }

  return null;
}

function getChildByIdDeep(parent: FrameNode, nodeId: string): SceneNode | null {
  return parent.findOne(node => node.id === nodeId) || null;
}

async function getLeadingItem(node: SceneNode): Promise<string> {
  const parentNode = figma.currentPage.selection[0] as FrameNode;
  const childNode = getChildByIdDeep(parentNode, "17:7307");

  if (!("children" in node) || !node.children) return "";
  for (const child of node.children) {
    if (child.name.toLowerCase().includes("leading item") && "children" in child && child.children) {
      for (const subChild of child.children) {
        if (subChild.type === "INSTANCE" && "children" in subChild && subChild.children?.length) {
          const mainComponent = await subChild.getMainComponentAsync();
          if (mainComponent) {
            return `.icon(imageName: .${toCamelCase(subChild.children[0].name)})`;
          }
        }
      }
    } else {
      if (child.type === "INSTANCE" && "children" in child && child.children?.length) {
        const mainComponent = await child.getMainComponentAsync();
        if (mainComponent) {
          if (await getComponentType(child) == "Avatar") {
            return `Image(veloAsset: .${toCamelCase(child.children[0].name)})\n.type(.avatar)`;  
          }
          if (await getComponentType(child) == "Icon") {
            return `Image(veloAsset: .${toCamelCase(child.name)})\n.type(.icon)`;  
          }
          return `Image(veloAsset: .${toCamelCase(child.children[0].name)})`;
        }
      }
    }
    const foundItem = await getLeadingItem(child);
    if (foundItem) return foundItem;
  }
  return "nil";
}

function toCamelCase(str: string): string {
  return str.toLowerCase()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(word => word.length > 0)
    .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function indent(text: string, numSpaces: number): string {
  const indentation = " ".repeat(numSpaces);
  return text
    .split("\n")
    .map(line => line.trim() ? indentation + line : line)
    .join("\n");
}

function formatTokenName(tokenName: string): string {
  return tokenName
    .split("/").pop()!
    .replace(/[-\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : "")
    .replace(/\((\d+),(\d+)\)/g, (_, num1, num2) => `${num1}${num2}`)
    .replace(/\((\d+)\)/g, "$1")
    .replace(/^\w/, c => c.toLowerCase());
}

function formatTypographyName(name: string): string {
  return name
    .split("/")
    .map((word, index) => 
      index === 0 
        ? word.toLowerCase().replace(/\s+/g, "") 
        : word.charAt(0).toUpperCase() + word.slice(1).replace(/\s+/g, "")
    )
    .join("");
}
