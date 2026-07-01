import type {
	Antenna,
	ChatMessage,
	ChatMessageLite,
	ChatMessageLiteFor1on1,
	ChatRoom,
	ChatRoomMembership,
	DriveFile,
	DriveFolder,
	Note,
	Notification,
	Signin,
	User,
	UserDetailed,
	UserDetailedNotMe,
	UserLite,
} from './autogen/models.js';
import type {
	AnnouncementCreated,
	EmojiAdded, EmojiDeleted,
	EmojiUpdated,
	PageEvent,
	QueueLogs,
	ServerStats,
	ServerStatsLog,
	ReversiGameDetailed,
} from './entities.js';
import type {
	ReversiUpdateKey,
} from './consts.js';

type ReversiUpdateSettings<K extends ReversiUpdateKey> = {
	key: K;
	value: ReversiGameDetailed[K];
};

export type Channels = {
	main: {
		params: null;
		events: {
			notification: (payload: Notification) => void;
			mention: (payload: Note) => void;
			reply: (payload: Note) => void;
			renote: (payload: Note) => void;
			follow: (payload: UserDetailedNotMe) => void; // 自分が他人をフォローしたとき
			followed: (payload: UserDetailed | UserLite) => void; // 他人が自分をフォローしたとき
			unfollow: (payload: UserDetailed) => void; // 自分が他人をフォロー解除したとき
			meUpdated: (payload: UserDetailed) => void;
			pageEvent: (payload: PageEvent) => void;
			urlUploadFinished: (payload: { marker: string; file: DriveFile; }) => void;
			readAllNotifications: () => void;
			unreadNotification: (payload: Notification) => void;
			notificationFlushed: () => void;
			unreadAntenna: (payload: Antenna) => void;
			newChatMessage: (payload: ChatMessage) => void;
			readAllAnnouncements: () => void;
			myTokenRegenerated: () => void;
			signin: (payload: Signin) => void;
			registryUpdated: (payload: {
				scope?: string[];
				key: string;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				value: any | null;
			}) => void;
			driveFileCreated: (payload: DriveFile) => void;
			readAntenna: (payload: Antenna) => void;
			receiveFollowRequest: (payload: User) => void;
			announcementCreated: (payload: AnnouncementCreated) => void;
			edited: (payload: Note) => void;
		};
		receives: null;
	};
	homeTimeline: {
		params: {
			withRenotes?: boolean;
			withFiles?: boolean;
			withBots?: boolean;
			includeFollowedChannels?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	localTimeline: {
		params: {
			withRenotes?: boolean;
			withReplies?: boolean;
			withFiles?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	hybridTimeline: {
		params: {
			withRenotes?: boolean;
			withReplies?: boolean;
			withFiles?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	globalTimeline: {
		params: {
			withRenotes?: boolean;
			withFiles?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	bubbleTimeline: {
		params: {
			withRenotes?: boolean;
			withFiles?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	userList: {
		params: {
			listId: string;
			withFiles?: boolean;
			withRenotes?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	hashtag: {
		params: {
			q: string[][];
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	roleTimeline: {
		params: {
			roleId: string;
			withRenotes?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	antenna: {
		params: {
			antennaId: string;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	channel: {
		params: {
			channelId: string;
			withFiles?: boolean;
			withRenotes?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	drive: {
		params: null;
		events: {
			fileCreated: (payload: DriveFile) => void;
			fileDeleted: (payload: DriveFile['id']) => void;
			fileUpdated: (payload: DriveFile) => void;
			folderCreated: (payload: DriveFolder) => void;
			folderDeleted: (payload: DriveFolder['id']) => void;
			folderUpdated: (payload: DriveFolder) => void;
		};
		receives: null;
	};
	serverStats: {
		params: null;
		events: {
			stats: (payload: ServerStats) => void;
			statsLog: (payload: ServerStatsLog) => void;
		};
		receives: {
			requestLog: {
				length?: number;
			};
		};
	};
	queueStats: {
		params: null;
		events: {
			stats: (payload: QueueLogs) => void;
			statsLog: (payload: QueueLogs[]) => void;
		};
		receives: {
			requestLog: {
				length?: number;
			};
		};
	};
	admin: {
		params: null;
		events: {
			newAbuseUserReport: {
				id: string;
				targetUserId: string;
				reporterId: string;
				comment: string;
			}
		};
		receives: null;
	};
	reversiGame: {
		params: {
			gameId: string;
		};
		events: {
			started: (payload: { game: ReversiGameDetailed; }) => void;
			ended: (payload: { winnerId: User['id'] | null; game: ReversiGameDetailed; }) => void;
			canceled: (payload: { userId: User['id']; }) => void;
			changeReadyStates: (payload: { user1: boolean; user2: boolean; }) => void;
			updateSettings: <K extends ReversiUpdateKey>(payload: { userId: User['id']; key: K; value: ReversiGameDetailed[K]; }) => void;
			log: (payload: Record<string, unknown>) => void;
		};
		receives: {
			putStone: {
				pos: number;
				id: string;
			};
			ready: boolean;
			cancel: null | Record<string, never>;
			updateSettings: ReversiUpdateSettings<ReversiUpdateKey>;
			claimTimeIsUp: null | Record<string, never>;
		}
	};
	chatUser: {
		params: {
			otherId: string;
		};
		events: {
			message: (payload: ChatMessageLite) => void;
			deleted: (payload: ChatMessageLite['id']) => void;
			deletedMany: (payload: ChatMessageLite['id'][]) => void;
			cleared: () => void;
			pruned: (payload: {
				cutoffId: ChatMessageLite['id'];
			}) => void;
			react: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
			unreact: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
			// 1on1 进入聊天时服务端直推:替代 chat/messages/user-timeline 初次 HTTP
			bootstrap: (payload: {
				messages: ChatMessageLiteFor1on1[];
			}) => void;
		};
		receives: {
			read: {
				id: ChatMessageLite['id'];
			};
		};
	};
	chatRoom: {
		params: {
			roomId: string;
		};
		events: {
			message: (payload: ChatMessageLite) => void;
			deleted: (payload: ChatMessageLite['id']) => void;
			deletedMany: (payload: ChatMessageLite['id'][]) => void;
			cleared: () => void;
			pruned: (payload: {
				cutoffId: ChatMessageLite['id'];
			}) => void;
			react: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
			unreact: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
			roomUpdated: (payload: {
				id: string;
				name: string;
				description: string;
				joinMode: 'inviteOnly' | 'open' | 'closed';
				avatarUrl: string | null;
				isSilenced: boolean;
				announcement: string;
				announcementPinned: boolean;
			}) => void;
			memberKicked: (payload: {
				roomId: string;
				userId: string;
				banned: boolean;
			}) => void;
			memberMuted: (payload: {
				roomId: string;
				userId: string;
				mutedUntil: string | null;
			}) => void;
			memberRoleUpdated: (payload: {
				roomId: string;
				userId: string;
				role: 'member' | 'manager';
			}) => void;
			// B-light:同房间 60ms 窗口内合并的高频事件批量包。客户端按顺序解包后再触发 message/react/unreact。
			batch: (payload: Array<
				| { type: 'message'; body: ChatMessageLite }
				| { type: 'react'; body: { reaction: string; user?: UserLite; messageId: ChatMessageLite['id'] } }
				| { type: 'unreact'; body: { reaction: string; user?: UserLite; messageId: ChatMessageLite['id'] } }
			>) => void;
			// 连上 chatRoom 通道后服务端直推的初始数据,客户端拿到就能渲染,
			// 替代 chat/rooms/show + chat/messages/room-timeline + chat/rooms/user-mutes/list + chat/rooms/members 四个 HTTP。
			bootstrap: (payload: {
				room: ChatRoom;
				messages: ChatMessageLite[];
				mutedRoomUserIds: string[];
				members: ChatRoomMembership[];
			}) => void;
		};
		receives: {
			read: {
				id: ChatMessageLite['id'];
			};
		};
	};
};

export type NoteUpdatedEvent = { id: Note['id'] } & ({
	type: 'reacted';
	body: {
		reaction: string;
		emoji?: {
			name: string;
			url: string;
		} | null;
		userId: User['id'];
	};
} | {
	type: 'unreacted';
	body: {
		reaction: string;
		userId: User['id'];
	};
} | {
	type: 'updated';
	body: Record<string, never>;
} | {
	type: 'deleted';
	body: {
		deletedAt: string;
	};
} | {
	type: 'pollVoted';
	body: {
		choice: number;
		userId: User['id'];
	};
} | {
	type: 'replied';
	body: {
		id: Note['id'];
		userId: User['id'];
	};
});

export type BroadcastEvents = {
	noteUpdated: (payload: NoteUpdatedEvent) => void;
	emojiAdded: (payload: EmojiAdded) => void;
	emojiUpdated: (payload: EmojiUpdated) => void;
	emojiDeleted: (payload: EmojiDeleted) => void;
	announcementCreated: (payload: AnnouncementCreated) => void;
};
