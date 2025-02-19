/**********************************
 * Constants & Configuration
 **********************************/
const SKIPPED_NODE_NAMES = ["Top App Bar", "Interaction State", "Bottom App Bar"];

let hasSegmentedControl = false;
let segmentOptions: string[] = [];
let hasCheckBox = false;
let customTextFields: string[] = [];

/**********************************
 * Figma Codegen Event Handler
 **********************************/
figma.codegen.on("generate", async (event) => {
    const node = event.node;
    if (!node) return [createErrorResult("No valid node selected.")];
    customTextFields = [];
    console.log({
        name: node.name,
        type: node.type,
        nodeId: node.id,
        properties: (node as InstanceNode).componentProperties,
        layoutMode: "layoutMode" in node ? node.layoutMode : "N/A",
        layoutAlign: "layoutAlign" in node ? node.layoutAlign : "N/A",
        parentLayoutAlign: node.parent && "layoutAlign" in node.parent ? node.parent.layoutAlign : "N/A",
        constraints: "constraints" in node ? node.constraints : "N/A"
    });

    console.log(getHorizontalAlignment(node));

    try {
        const { viewCode, viewModelCode } = await generateSwiftUICode(node);
        return [{
            language: "SWIFT",
            code: viewCode,
            title: `${sanitizeName(node.name)}View.swift`,
        },
        {
            language: "SWIFT",
            code: viewModelCode,
            title: `${sanitizeName(node.name)}ViewModel.swift`,
        }

        ];
    } catch (error) {
        console.error(error);
        return [createErrorResult("Error generating SwiftUI code.")];
    }

});

/**********************************
 * Utility Functions
 **********************************/
/**
 * Converts a given string to camelCase.
 */
function toCamelCase(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .split(" ")
        .filter(word => word.length > 0)
        .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
        .join("");
}

/**
 * Indents the given text with the specified number of spaces.
 */
function indent(text: string, numSpaces: number): string {
    const indentation = " ".repeat(numSpaces);
    return text
        .split("\n")
        .map(line => (line.trim() ? indentation + line : line))
        .join("\n");
}

/**
 * Formats a token name by cleaning and converting it.
 */
function formatTokenName(tokenName: string): string {
    return tokenName
        .split("/").pop()!
        .replace(/[-\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : "")
        .replace(/\((\d+),(\d+)\)/g, (_, num1, num2) => `${num1}${num2}`)
        .replace(/\((\d+)\)/g, "$1")
        .replace(/^\w/, c => c.toLowerCase());
}

/**
 * Formats a typography name by splitting on '/' and normalizing each segment.
 */
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

/**********************************
 * Node Info & Data Extraction Helpers
 **********************************/
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
    console.log("Text node:", node.name);

    const parentFrame = node.parent as FrameNode;

    // Ensure the layout is horizontal, otherwise assume "leading"
    // if (parentFrame.layoutMode !== "HORIZONTAL") {
    //     return "leading";
    // }

    // Get all children in the frame (not just TEXT nodes)
    const siblings = parentFrame.children;
    
    // Find the actual index by comparing node IDs instead of object references
    const index = siblings.findIndex(child => child.id === node.id);
    console.log("Node index:", index, "Total siblings:", siblings.length);

    if (parentFrame.layoutMode === "HORIZONTAL") {
    if (index === 0) {
        return "leading";
    } else if (index === siblings.length - 1) {
        return "trailing";
    }
    }
    // Check if explicitly centered
    if (node.textAlignHorizontal === "CENTER") {
        return "center";
    }

    return "leading";
}

/**********************************
 * Node Attribute Helpers
 **********************************/
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
    return `.cornerRadius(.${getSpacingTokenFromValue(node.cornerRadius)})`;
}

function getPaddingValues(node: SceneNode): string {
    if (node.parent === null) return "";
    if (!("paddingLeft" in node)) return "";

    const { paddingLeft = 0, paddingRight = 0, paddingTop = 0, paddingBottom = 0 } = node;
    const modifiers: string[] = [];

    if (paddingLeft === paddingRight && paddingLeft === paddingTop && paddingLeft === paddingBottom && paddingLeft > 0) {
        return `.padding(.${getSpacingTokenFromValue(paddingLeft)}) `;
    }
    if (paddingLeft === paddingRight && paddingTop === paddingBottom) {
        if (paddingLeft > 0) modifiers.push(`.padding(.horizontal, .${getSpacingTokenFromValue(paddingLeft)})`);
        if (paddingTop > 0) modifiers.push(`.padding(.vertical, .${getSpacingTokenFromValue(paddingTop)})`);
    } else {
        if (paddingLeft > 0) modifiers.push(`.padding(.leading, .${getSpacingTokenFromValue(paddingLeft)})`);
        if (paddingRight > 0) modifiers.push(`.padding(.trailing, .${getSpacingTokenFromValue(paddingRight)})`);
        if (paddingTop > 0) modifiers.push(`.padding(.top, .${getSpacingTokenFromValue(paddingTop)})`);
        if (paddingBottom > 0) modifiers.push(`.padding(.bottom, .${getSpacingTokenFromValue(paddingBottom)})`);
    }
    return modifiers.join("\n");
}

function isWidthFill(node: SceneNode): boolean {
    if ("layoutMode" in node && node.layoutMode !== "NONE") {
        if ("layoutAlign" in node && node.layoutAlign === "STRETCH") {
            return true;
        }
        if ("layoutAlign" in node && node.layoutAlign === "INHERIT" && node.parent && "layoutAlign" in node.parent) {
            return node.parent.layoutAlign === "STRETCH";
        }
    }
    if ("constraints" in node) {
        return node.constraints.horizontal === "SCALE";
    }
    return false;
}

async function getSwiftUIFrame(node: SceneNode): Promise<string> {
    let isButton = false;
    if (node.type === "INSTANCE") {
        const mainComponent = await node.getMainComponentAsync();
        if (
            (mainComponent && mainComponent.id.split(":")[0] === "159") ||
            (mainComponent && mainComponent.id.split(":")[0] === "119")
        ) {
            isButton = true;
        }
    }
    const isFillWidth = isWidthFill(node);
    if (isButton && isFillWidth) {
        return `.infinity`;
    } else if (isFillWidth) {
        return `.frame(maxWidth: .infinity`;
    }
    return "nil";
}

/**********************************
 * Content Generation Functions
 **********************************/
async function generateSwiftUICode(node: SceneNode): Promise<{ viewCode: string, viewModelCode: string }> {
    const sanitizedName = sanitizeName(node.name);
    const bodyContent = await generateBodyContent(node, true);
    const indentedBodyContent = indent(bodyContent, 8);

    const viewCode = `import SwiftUI

struct ${sanitizedName}View: View {
    @StateObject private var navigationState = VeloNavigationState(title: "${node.name}", hasSearchBar: false)
    @StateObject private var viewModel = ${sanitizedName}ViewModel()

    init() {
      VeloFont.registerFonts()
    }

    var body: some View {
${indentedBodyContent}
    .padding(.sm)
    .ignoresSafeArea(edges: .bottom)    
    .frame(maxWidth: 600)
    .environmentObject(navigationState)
}
}

#Preview {
    ${sanitizedName}View()
}`;

    let viewModelCode = `import SwiftUI

class ${sanitizedName}ViewModel: ObservableObject {
  @Published var title: String = "${node.name}"
`;

    if (hasSegmentedControl) {
        viewModelCode += `  @Published var segmentData: [String] = [${segmentOptions}]\n`;
        viewModelCode += `  @Published var selectedSegment: String?\n`;
    }

    if (hasCheckBox) {
        viewModelCode += `  @Published var isChecked: Bool = false\n`;
    }

    if (customTextFields.length > 0) {
        for (const fieldName of customTextFields) {
            viewModelCode += `  @Published var ${fieldName}: String = ""\n`;
        }
    }

    viewModelCode += `  \n  init() {\n    self.selectedSegment = segmentData.first \n  }\n}`;

    return { viewCode, viewModelCode };

}

async function generateBodyContent(node: SceneNode, isRoot: boolean = false): Promise<string> {
    if (node.type !== "FRAME" || SKIPPED_NODE_NAMES.includes(node.name)) return "";
    const frameNode = node as FrameNode;
    if (!frameNode.children) return "";

    const hasFrameChild = frameNode.children.some(child => child.type === "FRAME" && !SKIPPED_NODE_NAMES.includes(child.name));
    const content = [];
    for (let i = 0; i < frameNode.children.length; i++) {
        const child = frameNode.children[i];
        if (SKIPPED_NODE_NAMES.includes(child.name)) continue;
        content.push(await generateNodeContent(child, false));
        if (i < frameNode.children.length - 1 && isWidthFill(frameNode) && frameNode.layoutMode === "HORIZONTAL") {
            content.push("Spacer()\n");
        }
    }

    const stackType = isHorizontalLayout(node) ? "HStack" : "VStack";
    if (isItemSpacingNegative(node)) {
        return `${stackType}(spacing: -50) {\n  ${content.join("\n")}\n }\n`;
    }

    const modifiers = [
        !isRoot ? getPaddingValues(node) : null,
        getNodeColor(node) && `.background(${getNodeColor(node)})`,
        !isRoot ? getCornerRadiusToken(node) : null
    ].filter(Boolean);

    if (isRoot) {
        return `ScrollView {\n ${content.join("\n")}\n}${modifiers.length ? "\n" + modifiers.join("\n") : ""}`;
    }

    let spacing = isItemSpacingNegative(node) ? "-50" : `.${getSpacingTokenFromValue(node.itemSpacing)}`;
    if (isWidthFill(frameNode) && frameNode.layoutMode === "HORIZONTAL") {
        spacing = ".zero";
    }

    if (hasFrameChild) {
        return `${stackType}(spacing: ${spacing}) {\n  ${content.join("\n")}\n}${modifiers.length ? "\n" + modifiers.join("\n") : ""}\n`;
    }


    return `${stackType}(spacing: ${spacing}) {\n  ${content.join("\n")}\n}${modifiers.length ? "\n" + modifiers.join("\n") : ""}\n`;
}

function getSpacingTokenFromValue(value: number): string {
    const valueToTokenMap: Record<number, string> = {
        0: "none",
        2: "xxxs",
        4: "xxs",
        8: "xs",
        10: "sm",
        12: "sm",
        16: "md",
        24: "lg",
        32: "xl",
        40: "xxl",
        48: "xxxl",
        64: "xxxxl",
        360: "full"
    };

    return valueToTokenMap[value] || "";
}

async function generateNodeContent(node: SceneNode, isRoot: boolean): Promise<string> {
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
        VECTOR: (n) => Promise.resolve(generateShapeContent(n, "Circle")),
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

        let content = `SegmentedPicker(
    viewModel.segmentData,
    selectedItem: $viewModel.selectedSegment,
    backgroundColor: ${getNodeColor(node)}
  ) { item in
    Text(item)
      .font(.textRegularSemiBold)
      .frame(maxWidth: .infinity, alignment: .center)
      .foregroundColor(viewModel.selectedSegment == item ? .textNeutral05 : .textNeutral9)
      .padding(.vertical, 10)
    }
    .onChange(of: viewModel.selectedSegment!) { _, _ in }`
        return indent(content, 2);
    }
    if (componentType === "InputField") {
        return generateInputField(node);
    }
    if (componentType === "Checkbox") {
        hasCheckBox = true
        return `CheckboxView(isChecked: $viewModel.isChecked, text: "${getTextFromChild(node, "Label")}") \n`;
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
        return `${await getLeadingItemIcon(node)} \n`;
    }
    if (componentType === "Logo") {
        return `LOGO`;
    }
    return `Text("${node.name}") \n`;
}

async function getPropertyValue(node: InstanceNode, propertyKey: string): Promise<string> {
    const properties = node.componentProperties;
    const fullKey = Object.keys(properties).find(key => key.startsWith(propertyKey));

    if ("visible" in node && !node.visible) {
        console.log(`Skipping hidden node: ${node.name}`);
    }

    if (!fullKey) {
        return "nil";
    }

    const property = properties[fullKey];
    if (property.type === "BOOLEAN" && property.value === true) {
        const relatedSwapKey = Object.keys(properties).find(
            key => key.startsWith(propertyKey) && properties[key].type === "INSTANCE_SWAP"
        );
        if (relatedSwapKey) {
            const componentId = properties[relatedSwapKey].value as string;
            const componentNode = await figma.getNodeByIdAsync(componentId) as ComponentNode | InstanceNode;
            if (componentNode) {
                return `Image(veloAsset: .${toCamelCase(componentNode.name)})`;
            }
            return componentId;
        }
        return "nil";
    }
    if (property.type === "INSTANCE_SWAP" && typeof property.value === "string") {
        const componentNode = await figma.getNodeByIdAsync(property.value) as ComponentNode | InstanceNode;
        return componentNode ? `Image(veloAsset: .${toCamelCase(componentNode.name)})` : `nil`;
    }
    if (property.type === "VARIANT" && typeof property.value === "string") {
        const mainComponent = await node.getMainComponentAsync();
        const componentNode = await figma.getNodeByIdAsync(property.value) as ComponentNode | InstanceNode;
        return componentNode ? `Image(veloAsset: .${toCamelCase(componentNode.name)})` : `FF`;
    }
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
    if (node.name === "Logo") {
        return "Image(veloAsset: .arrowRightLong)";
    }

    const properties = node.componentProperties;
    const { hasIconLeft, hasIconCenter, hasIconRight, iconLeftName, iconCenterName, iconRightName } =
        extractIconProperties(properties, "Content Left", "Icon Right");
    const buttonText = getTextFromChild(node, "Button");
    const iconLeftPart = hasIconLeft && iconLeftName
        ? `iconLeft: .${toCamelCase(await getTextFromComponentID(node, iconLeftName))},`
        : "";
    const iconCenterPart = node.children[0].type === "INSTANCE"
        ? `iconCenter: .${toCamelCase(node.children[0].name)},`
        : "";
    const iconRightPart = hasIconRight && iconRightName
        ? `iconRight: .${toCamelCase(await getTextFromComponentID(node, iconRightName))},`
        : "";

    let style = properties["Style"];

    var buttonStyle = `.filledA`;

    if (style) {
        let value = `${style.value}`;
        buttonStyle = `.${toCamelCase(value)}`;
    }

    const isDisabled = "false";

    const lines = [
        buttonText && `"${buttonText}",`,
        `background: ${getNodeColor(node)},`,
        `style: ${buttonStyle},`,
        iconLeftPart.trim() || null,
        // iconCenterPart.trim() || null,
        iconRightPart.trim() || null,
        `isDisabled: ${isDisabled},`,
        `maxWidth: ${isWidthFill(node) ? ".infinity" : ".none"},`,
        `action: {}`
    ].filter(line => line && line.trim() !== "");

    const content = indent(lines.join("\n"), 2);
    const buttonCode = `VeloButton(
${content}
)
.frame(maxWidth: ${isWidthFill(node) ? ".infinity" : ".none"}, alignment: .leading)
`;

    return buttonCode;
}



async function generateInputField(node: InstanceNode): Promise<string> {
    const properties = node.componentProperties;
    const iconLeftKey = Object.keys(properties).find(key => key.includes("Icon Left"));
    const iconRightKey = Object.keys(properties).find(key => key.includes("Icon Right"));
    const iconLeftSwapKey = Object.keys(properties).find(key => key.includes("Icon-Left"));
    const iconRightSwapKey = Object.keys(properties).find(key => key.includes("Icon-Right"));

    const hasIconLeft = iconLeftKey ? properties[iconLeftKey].value === true : false;
    const hasIconRight = iconRightKey ? properties[iconRightKey].value === true : false;

    const iconLeftName = iconLeftSwapKey && typeof properties[iconLeftSwapKey].value === "string"
        ? properties[iconLeftSwapKey].value
        : null;
    const iconRightName = iconRightSwapKey && typeof properties[iconRightSwapKey].value === "string"
        ? properties[iconRightSwapKey].value
        : null;

        customTextFields.push(toCamelCase(getTextFromChild(node, "Text"))); // Ensure unique variable names

    return `CustomTextField(
      text: $viewModel.${toCamelCase(getTextFromChild(node, "Text") || `field${customTextFields.length + 1}`)},
      label: "${getTextFromChild(node, "Text")}",
      placeholder: "${getTextFromChild(node, "Text")}",
      isEmail: false,
      iconRight: ${await getPropertyValue(node, "Icon Right")},
      iconLeft: ${hasIconLeft ? await getPropertyValue(node, "Icon Left") : "nil"}
  )\n`;
}

function getHorizontalAlignment(node: SceneNode): "leading" | "trailing" | "center" | "space-between" | "unknown" {
    if (node.type !== "FRAME" || node.layoutMode !== "HORIZONTAL") {
        return "unknown";
    }

    const frameNode = node as FrameNode;

    // If the frame uses space-between, return immediately
    if (frameNode.primaryAxisAlignItems === "SPACE_BETWEEN") {
        return "space-between";
    }

    // Check if parent exists and is a horizontal frame
    const parentFrame = node.parent as FrameNode | null;
    if (!parentFrame || parentFrame.type !== "FRAME" || parentFrame.layoutMode !== "HORIZONTAL") {
        return "unknown";
    }

    // Get sibling nodes
    const siblings = parentFrame.children.filter(child => child.type === "FRAME") as FrameNode[];
    const index = siblings.indexOf(frameNode);

    if (index === 0) {
        return "leading";
    } else if (index === siblings.length - 1) {
        return "trailing";
    }

    return "center";
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

async function generateListRowProps(node: SceneNode): Promise<string> {
    const textFields = ["Overline", "Headline", "Supporting Text", "Meta Data"];
    const props = textFields
        .map(field => {
            const value = getTextFromChild(node, field);
            return value ? `${toCamelCase(field)}: "${value}"` : null;
        })
        .filter(Boolean);

    if (node.type === "INSTANCE") {
        let cool = node.findOne(n => n.name === "Leading Item") as InstanceNode;
        const leadingItem = await getLeadingItemIcon(cool);
        props.push(`leadingItem: .icon(imageName: .${toCamelCase(leadingItem)})`);
    }
    props.push("divider: true");
    return props.join(",\n               ");
}

async function getLeadingItemIcon(node: InstanceNode): Promise<string> {
    let omar = node.componentProperties["Type"];
    switch (omar.value) {
        case "Button":
            let buttonName = node.children[0] as InstanceNode;
            let test = buttonName.children[0].name;
            return test;
        case "Icon":
            let iconName = node.children[0].name;
            return iconName;
        case "171:3678":
            return "Radio";
        case "171:3680":
            return "Checkbox";
        case "171:3682":
            return "Switch";
        case "171:3684":
            return "Avatar";
        case "181:2602":
            return "Progress Circle";
        case "171:3686":
            return "Image";
        case "171:3688":
            return "Video";
        default:
            return "Unknown Component";
    }
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
    const componentType = componentMap[prefix] || "Container";

    if (componentType === "SegmentedControl") {
        hasSegmentedControl = true;
        const segments = node.children.map((child) => {
            const text = getTextFromChild(child, "Button");
            return `"${text}"`;
        });

        segmentOptions = [segments.join(", ")];
    }

    return componentType;
}