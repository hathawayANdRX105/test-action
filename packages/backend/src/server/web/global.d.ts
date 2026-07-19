declare const CLIENT_ENTRY: string;
declare const VERSION: string;
declare const LANGS_VERSION: string;
declare const LANGS: string[];

interface Window {
	VERSION?: string;
	LANGS_VERSION?: string;
	CLIENT_ENTRY?: string;
	__sharkeyBootMounted?: boolean;
}
