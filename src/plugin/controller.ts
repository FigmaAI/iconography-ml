import {toAndroidResourceName, ExtractComponents} from './extractComponents';
import Map from './map';

interface Model {
    name: string;
    model: string;
    label_map: string;
    saved_model_cli: {
        boxes: number;
        scores: number;
        classes: number;
    };
}

const defaultModel: Model = {
    name: 'CLAY',
    model: 'https://raw.githubusercontent.com/dusskapark/design-system-detector/master/icon/clay-mobilenetv2/web-model/model.json',
    label_map:
        'https://raw.githubusercontent.com/dusskapark/design-system-detector/master/icon/clay-mobilenetv2/web-model/label_map.json',
    saved_model_cli: {
        boxes: 7,
        scores: 5,
        classes: 4,
    },
};

function getParentPage(node: BaseNode): PageNode {
    let parent = node.parent;
    if (node.parent) {
        while (parent && parent.type !== 'PAGE') {
            parent = parent.parent;
        }
        return parent as PageNode;
    }
    return figma.currentPage;
}

// 컴포넌트셋의 부모페이지 이름을 찾아주는 함수
const recursiveName = (node) => {
    if (node.parent == null) return;
    if (node.parent.type == 'PAGE') {
        const label = toAndroidResourceName(node.name);
        return label;
    }
    return recursiveName(node.parent);
};

// 문서 안에 있는 모든 컴포넌트셋을 찾아서 객체로 만들어주는 함수
const getExportComponentFromDocumnet = async (componentSet: ComponentSetNode) => {
    let assetName = toAndroidResourceName(componentSet.name);
    let pageName = recursiveName(componentSet);

    let exportSetting: ExportSettingsImage = {
        format: 'PNG',
    };

    const imageData = await (<ExportMixin>componentSet.defaultVariant).exportAsync(exportSetting);

    const annotation = {
        id: componentSet.id,
        name: assetName,
        path: pageName,
        data: imageData,
        children: componentSet.children,
    };

    return annotation;
};

// 사용자가 선택한 아이콘셋을 varient 단위로 객체를 만들어주는 함수
const generateDataset = (data: {id: string}[]) => {
    const dataset = [];

    data.forEach((element) => {
        const componentSet = element.id;
        const array = figma.getNodeById(componentSet) as ComponentSetNode;

        array.children.forEach((component: ComponentNode) => {
            dataset.push({component, id: componentSet});
        });
    });
    return dataset;
};

const locationMap = (length: number) => {
    // 배치할 아이콘들의 x,y 값 생성
    let location = [...Map];

    for (let index = 0; index < 45 - length; index++) {
        let pick: number = Math.floor(Math.random() * location.length);
        location.splice(pick, 1);
    }
    return location;
};

const recursiveMap = (dataset: {component: ComponentNode; id: string}[], nodes: number) => {
    // Frame 생성
    const frame: FrameNode = createFrame(nodes);

    // 배치할 아이콘의 숫자를 렌덤으로 생성
    let numOfIcons: number = dataset.length;
    if (dataset.length > 45) {
        numOfIcons = Math.floor(Math.random() * Map.length);
        if (numOfIcons < 30 && dataset.length > 30) {
            numOfIcons = 30;
        }
    }

    // 아이콘 배치 위치 생성
    const location = locationMap(numOfIcons);
    for (let index = 0; index < location.length; index++) {
        // 아이콘을 랜덤으로 선택
        let pick = Math.floor(Math.random() * dataset.length);
        let pickedComponentId = dataset[pick].component.id;

        // 아이콘을 피그마 인스턴스 노드로 저장
        const instanced: InstanceNode = (figma.getNodeById(pickedComponentId) as ComponentNode).createInstance();
        instanced.x = location[index][0];
        instanced.y = location[index][1];

        // frame에 배치
        frame.appendChild(instanced);

        // 사용한 아이콘 삭제
        dataset.splice(pick, 1);
    }
    nodes = nodes + 1;

    if (dataset.length > 0) {
        return recursiveMap(dataset, nodes);
    } else {
        figma.closePlugin(`Generated ${nodes}pages!`);
    }
};

const createFrame = (index: number) => {
    // create a new frame
    const newFrame: FrameNode = figma.createFrame();
    newFrame.name = `image_${index}`;
    newFrame.resize(360, 640);
    newFrame.paddingRight = 20;
    newFrame.x = 360 * (index % 19) + 20 * (index % 19);
    newFrame.y = 640 * Math.floor(index / 19) + 20 * Math.floor(index / 19);
    return newFrame;
};

// 데이터셋 추출 코드

async function getExportImagesFromLayer(layer: any) {
    let assetName = toAndroidResourceName(layer.name);

    let exportSetting: ExportSettingsImage = {
        format: 'PNG',
    };

    const imageData = await (<ExportMixin>layer).exportAsync(exportSetting);
    const components = ExtractComponents(layer);
    const images = {
        id: layer.id,
        width: Math.round(layer.width),
        height: Math.round(layer.height),
        path: assetName + '.png',
        data: imageData,
        components: components,
    };

    return images;
}
const updateModel = (message) => {
    let msg = JSON.parse(message);
    const model: Model = {
        name: msg.name,
        model: msg.model,
        label_map: msg.label_map,
        saved_model_cli: {
            boxes: msg.boxes,
            scores: msg.scores,
            classes: msg.classes,
        },
    };
    return model;
};


async function main() {
    const filename = toAndroidResourceName(figma.root.name);
    const current = await figma.clientStorage.getAsync(filename);
    const current_model = !current ? defaultModel : current;

    if (figma.command === 'annotation') {
        // Load components
        let componentSet: any[] = [];
        componentSet = componentSet.concat(figma.root.findAll((child) => child.type === 'COMPONENT_SET'));

        if (componentSet.length === 0) {
            figma.closePlugin('No Component in document.');
        } else {
            Promise.all(componentSet.map((component) => getExportComponentFromDocumnet(component)))
                .then((annotation) => {
                    figma.showUI(__html__, {width: 360, height: 640});
                    figma.ui.postMessage({
                        type: 'annotation',
                        annotation: annotation,
                    });
                })
                .catch((error) => {
                    figma.closePlugin(error.message);
                });
        }

        figma.ui.onmessage = (msg) => {
            if (msg.type === 'showLayer') {
                const layerId = msg.id;
                const layer = figma.getNodeById(layerId);
                const page = getParentPage(layer);
                figma.currentPage = page;
                figma.viewport.scrollAndZoomIntoView([layer]);
            }
            if (msg.type === 'generate-assets') {
                // create a new page
                const newPage: PageNode = figma.createPage();
                newPage.name = 'Iconography-ML';
                figma.currentPage = newPage;

                // // Load components
                Promise.all(generateDataset(msg.data))
                    .then((dataset) => {
                        recursiveMap(dataset, 0);
                    })
                    .catch((error) => {
                        figma.closePlugin(error.message);
                    });
            }
        };
    }
    if (figma.command === 'dataset') {
        const currentPage = figma.currentPage;
        const selectedLayers = currentPage.selection;

        // Get all exportable layers
        let exportableLayers: any[] = [];
        if (selectedLayers.length === 0) {
            figma.closePlugin('Please select at least 1 layer.');
        } else {
            selectedLayers.forEach((layer) => {
                if (layer.type === 'SLICE' || (<ExportMixin>layer).exportSettings.length > 0) {
                    exportableLayers.push(layer);
                }
                if (layer.type === 'GROUP') {
                    exportableLayers = exportableLayers.concat(
                        (<ChildrenMixin>layer).findAll(
                            (child) => child.type === 'SLICE' || (<ExportMixin>child).exportSettings.length > 0
                        )
                    );
                }
            });

            if (exportableLayers.length === 0) {
                figma.closePlugin('No exportable layers in document.');
            } else {
                Promise.all(exportableLayers.map((layer) => getExportImagesFromLayer(layer)))
                    .then((exportImages) => {
                        const uiHeight = Math.min(exportableLayers.length * 48 + 16 + 48, 400);
                        figma.showUI(__html__, {width: 360, height: uiHeight});
                        figma.ui.postMessage({
                            type: 'dataset',
                            exportImages: exportImages,
                        });
                    })
                    .catch((error) => {
                        figma.closePlugin(error.message);
                    });
            }
        }
        figma.ui.onmessage = (msg) => {
            if (msg.type === 'showLayer') {
                const layerId = msg.id;
                const layer = figma.getNodeById(layerId);
                const page = getParentPage(layer);
                figma.currentPage = page;
                figma.viewport.scrollAndZoomIntoView([layer]);
            }
        };
    }
    if (figma.command === 'predict') {
        const currentPage = figma.currentPage;
        const selectedLayers = currentPage.selection;

        // Get all exportable layers
        let exportableLayers: any[] = [];
        if (selectedLayers.length === 0) {
            figma.closePlugin('Please select at least 1 layer.');
        } else {
            selectedLayers.forEach((layer) => {
                if (layer.type === 'SLICE' || (<ExportMixin>layer).exportSettings.length > 0) {
                    exportableLayers.push(layer);
                }
                if (layer.type === 'GROUP') {
                    exportableLayers = exportableLayers.concat(
                        (<ChildrenMixin>layer).findAll(
                            (child) => child.type === 'SLICE' || (<ExportMixin>child).exportSettings.length > 0
                        )
                    );
                }
            });

            if (exportableLayers.length === 0) {
                figma.closePlugin('No exportable layers in document.');
            } else {
                Promise.all(exportableLayers.map((layer) => getExportImagesFromLayer(layer)))
                    .then((exportImages) => {
                        figma.showUI(__html__, {width: 360, height: 640 + 48 + 48});
                        figma.ui.postMessage({
                            type: 'predict',
                            exportImages: exportImages,
                            current_model: current_model,
                        });
                    })
                    .catch((error) => {
                        figma.closePlugin(error.message);
                    });

                figma.ui.onmessage = (msg) => {
                    // Show layer
                    if (msg.type === 'showLayer') {
                        const layerId = msg.id;
                        const layer = figma.getNodeById(layerId);
                        const page = getParentPage(layer);
                        figma.currentPage = page;
                        figma.viewport.scrollAndZoomIntoView([layer]);
                    }

                    if (msg.type === 'alert') {
                        figma.notify(msg.message, {timeout: 1000});
                    }
                };
            }
        }
    }
    if (figma.command === 'model') {
        figma.showUI(__html__, {width: 360, height: 480});
        figma.ui.postMessage({
            type: 'model',
            current_model: current_model,
        });
        figma.ui.onmessage = async (msg) => {
            if (msg.type === 'config-model') {
                const model_value = updateModel(msg.message);
                console.log('plugin: ', model_value);
                await figma.clientStorage.setAsync(filename, model_value);
                figma.notify(`${model_value.name} is set as a model`, {timeout: 1000});
            }
        };
    }
}
main();
