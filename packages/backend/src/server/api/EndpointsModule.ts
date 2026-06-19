/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Module, type Provider, type Import } from '@nestjs/common';
import { CoreModule } from '@/core/CoreModule.js';
import * as endpointsObject from './endpoint-list.js';
import { GetterService } from './GetterService.js';
import { ApiLoggerService } from './ApiLoggerService.js';
import { NoteTranslationService } from './endpoints/notes/translate-common.js';

const endpoints = Object.entries(endpointsObject);
const endpointProviders = endpoints.map(([path, endpoint]): Provider => ({ provide: `ep:${path}`, useClass: endpoint.default }));

/** External module dependencies */
const $Imports = [
	CoreModule,
] as const satisfies Import[];

@Module({
	imports: $Imports,
	providers: [
		GetterService,
		ApiLoggerService,
		NoteTranslationService,
		...endpointProviders,
	],
	exports: [
		...endpointProviders,
		$Imports,
	].flat(),
})
export class EndpointsModule {}
