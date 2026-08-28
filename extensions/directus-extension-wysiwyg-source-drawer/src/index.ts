const STYLE_ID = 'directus-wysiwyg-source-drawer-css';

const CSS = `
.v-drawer:has(.input-code),
.v-drawer:has(.cm-editor) {
	inline-size: calc(100% - 3.625rem) !important;
	max-inline-size: none !important;
}

.v-drawer:has(.input-code) .cm-editor,
.v-drawer:has(.cm-editor) {
	min-block-size: calc(100vh - 12rem);
}

.v-drawer:has(.input-code) .CodeMirror-search-field,
.v-drawer:has(.cm-editor) .CodeMirror-search-field {
	width: 16rem;
	height: 2rem;
	z-index: 2;
	position: absolute;
	bottom: 1rem;
	left: 1.2rem;
}
`;

export default ({ embed }: { embed: (target: 'head' | 'body', value: string) => void }) => {
	embed('head', `<style id="${STYLE_ID}">${CSS}</style>`);
};
