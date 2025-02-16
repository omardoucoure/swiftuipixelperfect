export function mapNodeToSwiftUI(node) {
    switch (node.name.trim().toLowerCase()) {
        case "list":
            return `VList(itemViewModels) { item in
                Search6Row(itemViewModel: item)
            }`;
        case "button":
            return `Button(action: {}) {
                Text("Click Me")
            }
            .buttonStyle(.primary)`;
        case "textfield":
            return `TextField("Enter text", text: $text)`;
        case "image":
            return `Image("placeholder-image")
                .resizable()
                .aspectRatio(contentMode: .fill)`;
        case "header":
            return `Text("Header")
                .font(.title)
                .bold()`;
        case "footer":
            return `Text("Footer")
                .font(.footnote)
                .foregroundColor(.gray)`;
        case "avatar":
            return `Image(systemName: "person.circle.fill")
                .resizable()
                .frame(width: 40, height: 40)`;
        case "stats":
            return `Container(background: Color.surfacePrimary100) {
                Text("ChatOverview1")
                    .foregroundColor(.textNeutral05)
            }`;
        default:
            if ("children" in node && Array.isArray(node.children)) {
                const childrenCode = node.children
                    .map((child) => mapNodeToSwiftUI(child))
                    .filter(code => code.trim() !== "")
                    .join("\n");
                return childrenCode.trim()
                    ? `VStack(spacing: .sm) {\n${indent(childrenCode, 2)}\n}`
                    : "";
            }
            return "";
    }
}
function indent(code, spaces) {
    return code
        .split("\n")
        .map(line => " ".repeat(spaces) + line)
        .join("\n");
}
