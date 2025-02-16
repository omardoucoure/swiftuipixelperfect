export async function extractListData(node: SceneNode): Promise<any[]> {
    let extractedData: any[] = [];

    // ✅ Step 1: Find all "List" nodes
    const lists = await findLists(node);
    console.log(`📌 Found ${lists.length} List(s)`);

    for (const list of lists) {
        // ✅ Step 2: Get List Properties
        const listProperties = await getListProperties(list);
        console.log(`📊 Extracted Properties for List:`, listProperties);

        // ✅ Step 3: Get Rows Inside the List
        const listRows = getListRows(list);
        console.log(`📌 Found ${listRows.length} Rows in List`);

        // ✅ Step 4: Extract Data from Each Row
        for (const row of listRows) {
            const rowProperties = await getListProperties(row);
            const icon = getIconFromListItem(row);

            extractedData.push({
                overline: rowProperties["Overline"] || "Default Value",
                headline: rowProperties["Headline"] || "Default Value",
                supportingText: rowProperties["Supporting Text"] || "Default Value",
                leadingItem: icon ? { type: "icon", name: icon } : null,
                trailingItem: rowProperties["Trailing Item"] || "Default Value",
                metaData: rowProperties["Metadata"] || "Default Value",
                divider: rowProperties["Divider"] === "true",
            });
        }
    }

    return extractedData;
}

/** ✅ Finds all "List" Components */
async function findLists(node: SceneNode): Promise<SceneNode[]> {
    let lists: SceneNode[] = [];

    if (node.type === "INSTANCE") {
        const mainComponent = await node.getMainComponentAsync();
        if (mainComponent && mainComponent.id.startsWith("171")) {
            lists.push(node);
        }
    }

    if ("children" in node && Array.isArray(node.children)) {
        for (const child of node.children) {
            const childLists = await findLists(child);
            lists = lists.concat(childLists);
        }
    }

    return lists;
}

/** ✅ Gets all component properties of a List or Row */
async function getListProperties(node: SceneNode): Promise<{ [key: string]: any }> {
    let properties: { [key: string]: any } = {};

    if (node.type === "INSTANCE" && node.componentProperties) {
        for (const [key, prop] of Object.entries(node.componentProperties)) {
            properties[key] = prop.value;
        }
    }

    return properties;
}

/** ✅ Gets all rows inside a List */
function getListRows(list: SceneNode): SceneNode[] {
    let rows: SceneNode[] = [];

    if ("children" in list && Array.isArray(list.children)) {
        for (const child of list.children) {
            if (child.type === "INSTANCE") {
                rows.push(child);
            }
        }
    }

    return rows;
}

/** ✅ Finds a button in a List Item */
function findButtonInListItem(node: SceneNode): SceneNode | null {
    if ("children" in node && Array.isArray(node.children)) {
        for (const child of node.children) {
            if (child.name.toLowerCase().includes("button")) {
                return child;
            }
        }
    }
    return null;
}

/** ✅ Extracts the Icon from a Button in a List Item */
function getIconFromListItem(listItem: SceneNode): string | null {
    const button = findButtonInListItem(listItem);
    if (button && "children" in button) {
        for (const child of button.children) {
            if (child.name.toLowerCase().includes("icon") || child.name.toLowerCase().includes("arrow")) {
                return child.name;
            }
        }
    }
    return null;
}