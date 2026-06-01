import type { Endpoints as Gen } from './autogen/endpoint.js';
import type { Channel, ChatRoom, Note, UserDetailed } from './autogen/models.js';
import type {
	AdminChatRoomsListRequest,
	AdminChatRoomsListResponse,
	AdminChatRoomsMessagesRequest,
	AdminChatRoomsMessagesResponse,
	AdminChatRoomsShowRequest,
	AdminChatRoomsShowResponse,
	AdminChatRoomsUpdateRequest,
	AdminChatRoomsUpdateResponse,
	AdminRolesCreateRequest,
	AdminRolesCreateResponse,
	UsersShowRequest,
	EmptyRequest,
	EmptyResponse,
} from './autogen/entities.js';
import type {
	PartialRolePolicyOverride,
	SigninFlowRequest,
	SigninFlowResponse,
	SigninWithPasskeyInitResponse,
	SigninWithPasskeyRequest,
	SigninWithPasskeyResponse,
	SignupPendingRequest,
	SignupPendingResponse,
	SignupRequest,
	SignupResponse,
} from './entities.js';

type Overwrite<T, U extends { [Key in keyof T]?: unknown }> = Omit<
	T,
	keyof U
> & U;

type SwitchCase<Condition = unknown, Result = unknown> = {
	$switch: {
		$cases: [Condition, Result][],
		$default: Result;
	};
};

type IsNeverType<T> = [T] extends [never] ? true : false;
type StrictExtract<Union, Cond> = Cond extends Union ? Union : never;

type AiProvider = {
	id: string;
	name: string;
	baseUrl: string;
	isEnabled: boolean;
	models: string[];
	defaultModel: string | null;
	allowedModels: string[];
	timeoutMs: number;
	maxTokens: number;
	temperature: number;
	maskedApiKey: string | null;
	hasApiKey: boolean;
	createdAt: string;
	updatedAt: string;
};

type AiSettings = {
	enableAi: boolean;
	showAiInNavbar: boolean;
	aiDefaultProviderId: string | null;
	aiMaxContextMessages: number;
};

type AiProviderTestResult = {
	ok: boolean;
	models: string[];
	elapsedMs: number;
	error: string | null;
};

type AiStatus = {
	enabled: boolean;
	providers: {
		id: string;
		name: string;
		defaultModel: string | null;
		allowedModels: string[];
	}[];
	defaultProviderId: string | null;
	maxContextMessages: number;
};

type AiConversation = {
	id: string;
	title: string;
	providerId: string | null;
	model: string;
	systemPrompt: string | null;
	createdAt: string;
	updatedAt: string;
};

type AiMessage = {
	id: string;
	conversationId: string;
	userId: string;
	role: 'system' | 'user' | 'assistant';
	content: string | null;
	attachments: {
		fileId?: string;
		name?: string;
		type?: string;
		url?: string;
	}[];
	usage: Record<string, unknown> | null;
	error: string | null;
	createdAt: string;
};

type AiChatResult = {
	conversation: AiConversation;
	userMessage: AiMessage;
	assistantMessage: AiMessage;
	content: string;
};

type IsCaseMatched<E extends keyof Endpoints, P extends Endpoints[E]['req'], C extends number> =
	Endpoints[E]['res'] extends SwitchCase
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		? IsNeverType<StrictExtract<Endpoints[E]['res']['$switch']['$cases'][C], [P, any]>> extends false ? true : false
		: false;

type GetCaseResult<E extends keyof Endpoints, P extends Endpoints[E]['req'], C extends number> =
	Endpoints[E]['res'] extends SwitchCase
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		? StrictExtract<Endpoints[E]['res']['$switch']['$cases'][C], [P, any]>[1]
		: never;

/* eslint-disable @stylistic/indent */
export type SwitchCaseResponseType<E extends keyof Endpoints, P extends Endpoints[E]['req']> = Endpoints[E]['res'] extends SwitchCase
	? IsCaseMatched<E, P, 0> extends true ? GetCaseResult<E, P, 0> :
		IsCaseMatched<E, P, 1> extends true ? GetCaseResult<E, P, 1> :
			IsCaseMatched<E, P, 2> extends true ? GetCaseResult<E, P, 2> :
				IsCaseMatched<E, P, 3> extends true ? GetCaseResult<E, P, 3> :
					IsCaseMatched<E, P, 4> extends true ? GetCaseResult<E, P, 4> :
						IsCaseMatched<E, P, 5> extends true ? GetCaseResult<E, P, 5> :
							IsCaseMatched<E, P, 6> extends true ? GetCaseResult<E, P, 6> :
								IsCaseMatched<E, P, 7> extends true ? GetCaseResult<E, P, 7> :
									IsCaseMatched<E, P, 8> extends true ? GetCaseResult<E, P, 8> :
										IsCaseMatched<E, P, 9> extends true ? GetCaseResult<E, P, 9> :
											Endpoints[E]['res']['$switch']['$default'] : Endpoints[E]['res'];
/* eslint-enable @stylistic/indent */

export type Endpoints = Overwrite<
	Gen,
	{
		'users/show': {
			req: UsersShowRequest;
			res: {
				$switch: {
					$cases: [[
						{
							userIds?: string[];
						}, UserDetailed[],
					]];
					$default: UserDetailed;
				};
			};
		},
		// api.jsonには載せないものなのでここで定義
		'signup': {
			req: SignupRequest;
			res: SignupResponse;
		},
		// api.jsonには載せないものなのでここで定義
		'signup-pending': {
			req: SignupPendingRequest;
			res: SignupPendingResponse;
		},
		// api.jsonには載せないものなのでここで定義
		'signin-flow': {
			req: SigninFlowRequest;
			res: SigninFlowResponse;
		},
		'signin-with-passkey': {
			req: SigninWithPasskeyRequest;
			res: {
				$switch: {
					$cases: [
						[
							{
								context: string;
							},
							SigninWithPasskeyResponse,
						],
					];
					$default: SigninWithPasskeyInitResponse;
				},
			},
		},
		'admin/roles/create': {
			req: Overwrite<AdminRolesCreateRequest, { policies: PartialRolePolicyOverride }>;
			res: AdminRolesCreateResponse;
		},
		'admin/chat/rooms/list': {
			req: AdminChatRoomsListRequest;
			res: AdminChatRoomsListResponse;
		},
		'admin/chat/rooms/messages': {
			req: AdminChatRoomsMessagesRequest;
			res: AdminChatRoomsMessagesResponse;
		},
		'admin/chat/rooms/show': {
			req: AdminChatRoomsShowRequest;
			res: AdminChatRoomsShowResponse;
		},
		'admin/chat/rooms/update': {
			req: AdminChatRoomsUpdateRequest;
			res: AdminChatRoomsUpdateResponse;
		},
		'admin/ai/providers/list': {
			req: EmptyRequest;
			res: AiProvider[];
		},
		'admin/ai/providers/create': {
			req: {
				name: string;
				baseUrl: string;
				apiKey: string;
				isEnabled?: boolean;
				models?: string[];
				defaultModel?: string | null;
				allowedModels?: string[];
				timeoutMs?: number;
				maxTokens?: number;
				temperature?: number;
			};
			res: AiProvider;
		},
		'admin/ai/providers/update': {
			req: {
				id: string;
				name?: string;
				baseUrl?: string;
				apiKey?: string | null;
				isEnabled?: boolean;
				models?: string[];
				defaultModel?: string | null;
				allowedModels?: string[];
				timeoutMs?: number;
				maxTokens?: number;
				temperature?: number;
			};
			res: AiProvider;
		},
		'admin/ai/providers/delete': {
			req: {
				id: string;
			};
			res: EmptyResponse;
		},
		'admin/ai/providers/test': {
			req: {
				id: string;
			};
			res: AiProviderTestResult;
		},
		'admin/ai/providers/fetch-models': {
			req: {
				id: string;
			};
			res: AiProviderTestResult & { provider: AiProvider };
		},
		'admin/ai/settings/show': {
			req: EmptyRequest;
			res: AiSettings;
		},
		'admin/ai/settings/update': {
			req: Partial<AiSettings>;
			res: AiSettings;
		},
		'ai/status': {
			req: EmptyRequest;
			res: AiStatus;
		},
		'ai/conversations/list': {
			req: EmptyRequest;
			res: AiConversation[];
		},
		'ai/conversations/create': {
			req: {
				providerId?: string | null;
				model?: string | null;
				title?: string | null;
				systemPrompt?: string | null;
			};
			res: AiConversation;
		},
		'ai/conversations/show': {
			req: {
				conversationId: string;
			};
			res: AiConversation;
		},
		'ai/conversations/update': {
			req: {
				conversationId: string;
				title?: string | null;
				systemPrompt?: string | null;
			};
			res: AiConversation;
		},
		'ai/conversations/delete': {
			req: {
				conversationId: string;
			};
			res: EmptyResponse;
		},
		'ai/messages/list': {
			req: {
				conversationId: string;
			};
			res: AiMessage[];
		},
		'ai/messages/delete': {
			req: {
				messageId: string;
			};
			res: EmptyResponse;
		},
		'ai/chat': {
			req: {
				conversationId?: string | null;
				providerId?: string | null;
				model?: string | null;
				content?: string;
				fileIds?: string[];
				systemPrompt?: string | null;
			};
			res: AiChatResult;
		},
		'chat/rooms/manage/update': {
			req: {
				roomId: string;
				messageRetentionDays: number | null;
			};
			res: ChatRoom;
		},
		'chat/rooms/manage/delete-all-messages': {
			req: {
				roomId: string;
			};
			res: EmptyResponse;
		},
		'chat/rooms/manage/delete-user-messages': {
			req: {
				roomId: string;
				userId: string;
			};
			res: {
				deletedIds: string[];
			};
		},
		'chat/rooms/manage/stats': {
			req: {
				roomId: string;
				days?: number;
			};
			res: {
				total: number;
				oldestAt: string | null;
				newestAt: string | null;
				daily: {
					date: string;
					count: number;
				}[];
			};
		},
		'notes/recommended-timeline': {
			req: {
				scope?: 'local' | 'social' | 'global' | 'mixed';
				surface?: 'home' | 'explore';
				category?: 'forYou' | 'trending' | 'messages' | 'sports' | 'entertainment' | 'tutorials' | 'resources';
				sort?: 'personalized' | 'latestReply';
				rankMode?: 'personalized' | 'trending';
				withFiles?: boolean;
				withRenotes?: boolean;
				withBots?: boolean;
				limit?: number;
				offset?: number;
				sinceId?: string;
				untilId?: string;
				sinceDate?: number;
				untilDate?: number;
			};
			res: Note[];
		},
		'notes/discovery-sections': {
			req: {
				limit?: number;
			};
			res: {
				trends: {
					popularSearches: string[];
					recentTerms: string[];
					hashtags: string[];
				};
				coverNotes: Note[];
				hotNotes: Note[];
				tutorialNotes: Note[];
				channels: Channel[];
				users: UserDetailed[];
			};
		},
		'notes/search-trends': {
			req: {
				limit?: number;
			};
			res: {
				popularSearches: string[];
				recentTerms: string[];
				hashtags: string[];
			};
		},
		'notes/recommendation-feedback': {
			req: {
				noteId: string;
				event: 'impression' | 'click' | 'expand' | 'dwell' | 'react' | 'renote' | 'reply' | 'clip';
				dwellMs?: number;
			};
			res: EmptyRequest;
		},
	}
>;

export type EndpointsWithOptionalParams = {
	[E in keyof Endpoints]: EmptyRequest extends Endpoints[E]['req'] ? Endpoints[E] : never;
};
