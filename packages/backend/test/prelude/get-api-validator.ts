/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Ajv from 'ajv';
import { Schema } from '@/misc/json-schema.js';
import { MISSKEY_ID_MAX_LENGTH } from '@/server/api/input-limits.js';

export const getValidator = (paramDef: Schema) => {
	const ajv = new Ajv.default({
		useDefaults: true,
	});
	ajv.addFormat('misskey:id', new RegExp(`^[a-zA-Z0-9]{1,${MISSKEY_ID_MAX_LENGTH}}$`));

	return ajv.compile(paramDef);
};
