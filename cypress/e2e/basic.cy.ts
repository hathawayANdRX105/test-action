/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

describe('Before setup instance', () => {
	beforeEach(() => {
		cy.resetState();
	});

	afterEach(() => {
		// テスト終了直前にページ遷移するようなテストケース(例えばアカウント作成)だと、たぶんCypressのバグでブラウザの内容が次のテストケースに引き継がれてしまう(例えばアカウントが作成し終わった段階からテストが始まる)。
		// waitを入れることでそれを防止できる
		cy.wait(1000);
	});

  it('successfully loads', () => {
    cy.visitHome();
  });

	it('setup instance', () => {
    cy.visitHome();

		cy.intercept('POST', '/api/admin/accounts/create').as('signup');

		cy.get('[data-cy-admin-initial-password] input').type('example_password_please_change_this_or_you_will_get_hacked');
		cy.get('[data-cy-admin-username] input').type('admin');
		cy.get('[data-cy-admin-password] input').type('admin1234');
		cy.get('[data-cy-admin-ok]').click();

		// なぜか動かない
		//cy.wait('@signup').should('have.property', 'response.statusCode');
		cy.wait('@signup');
  });
});

describe('After setup instance', () => {
	beforeEach(() => {
		cy.resetState();

		// インスタンス初期セットアップ
		cy.registerUser('admin', 'pass', true);
	});

	afterEach(() => {
		// テスト終了直前にページ遷移するようなテストケース(例えばアカウント作成)だと、たぶんCypressのバグでブラウザの内容が次のテストケースに引き継がれてしまう(例えばアカウントが作成し終わった段階からテストが始まる)。
		// waitを入れることでそれを防止できる
		cy.wait(1000);
	});

  it('successfully loads', () => {
    cy.visitHome();
  });

	it('signup', () => {
		cy.visitHome();

		cy.intercept('POST', '/api/signup').as('signup');

		cy.get('[data-cy-signup]', { timeout: 30000 }).click();
		cy.get('[data-cy-signup-rules-continue]').should('be.disabled');
		cy.get('[data-cy-signup-rules-notes-agree] [data-cy-switch-toggle]').click();
		cy.get('[data-cy-modal-dialog-ok]').click();
		cy.get('[data-cy-signup-rules-continue]').should('not.be.disabled');
		cy.get('[data-cy-signup-rules-continue]').click();

		cy.get('[data-cy-signup-submit]').should('be.disabled');
		cy.get('[data-cy-signup-username] input').type('alice');
		cy.get('[data-cy-signup-submit]').should('be.disabled');
		cy.get('[data-cy-signup-password] input').type('alice1234');
		cy.get('[data-cy-signup-submit]').should('be.disabled');
		cy.get('[data-cy-signup-password-retype] input').type('alice1234');
		cy.get('[data-cy-signup-submit]').should('not.be.disabled');
		cy.get('[data-cy-signup-submit]').click();

		cy.wait('@signup');
  });

  it('signup with duplicated username', () => {
		cy.registerUser('alice', 'alice1234');

		cy.visitHome();

		// ユーザー名が重複している場合の挙動確認
		cy.get('[data-cy-signup]', { timeout: 30000 }).click();
		cy.get('[data-cy-signup-rules-continue]').should('be.disabled');
		cy.get('[data-cy-signup-rules-notes-agree] [data-cy-switch-toggle]').click();
		cy.get('[data-cy-modal-dialog-ok]').click();
		cy.get('[data-cy-signup-rules-continue]').should('not.be.disabled');
		cy.get('[data-cy-signup-rules-continue]').click();

		cy.get('[data-cy-signup-username] input').type('alice');
		cy.get('[data-cy-signup-password] input').type('alice1234');
		cy.get('[data-cy-signup-password-retype] input').type('alice1234');
		cy.get('[data-cy-signup-submit]').should('be.disabled');
  });
});

describe('After user signup', () => {
	beforeEach(() => {
		cy.resetState();

		// インスタンス初期セットアップ
		cy.registerUser('admin', 'pass', true);

		// ユーザー作成
		cy.registerUser('alice', 'alice1234');
	});

	afterEach(() => {
		// テスト終了直前にページ遷移するようなテストケース(例えばアカウント作成)だと、たぶんCypressのバグでブラウザの内容が次のテストケースに引き継がれてしまう(例えばアカウントが作成し終わった段階からテストが始まる)。
		// waitを入れることでそれを防止できる
		cy.wait(1000);
	});

  it('successfully loads', () => {
    cy.visitHome();
  });

	it('signin', () => {
		cy.visitHome();

		cy.intercept('POST', '/api/signin-flow').as('signin');

		cy.get('[data-cy-signin]', { timeout: 30000 }).click();

		cy.get('[data-cy-signin-page-input]', { timeout: 10000 }).should('be.visible');
		cy.get('[data-cy-signin-username] input').type('alice');
		cy.get('[data-cy-signin-page-input-continue]').click();
		cy.wait('@signin').its('response.statusCode').should('eq', 200);

		cy.get('[data-cy-signin-page-password]', { timeout: 30000 }).should('be.visible');
		cy.get('[data-cy-signin-password] input').type('alice1234');
		cy.get('[data-cy-signin-page-password-continue]').click();
		cy.wait('@signin').its('response.statusCode').should('eq', 200);
  });

	it('suspend', function() {
		const token = this.admin.token;
		expect(token, 'admin token').to.be.a('string');
		expect(this.alice.id, 'alice id').to.be.a('string');

		cy.request({
			method: 'POST',
			url: '/api/admin/suspend-user',
			headers: { Authorization: `Bearer ${token}` },
			body: { userId: this.alice.id },
		}).its('status').should('be.oneOf', [200, 204]);

		// Contract: signin-flow rejects suspended accounts (UI dialog is best-effort).
		cy.request({
			method: 'POST',
			url: '/api/signin-flow',
			body: { username: 'alice' },
			failOnStatusCode: false,
		}).then((res) => {
			expect(res.status).to.eq(403);
			const err = res.body?.error ?? res.body;
			expect(String(err?.code || '')).to.eq('ACCOUNT_SUSPENDED');
		});
	});
		// UI dialog (i18n title/description) when frontend maps the error
		cy.contains(/凍結|suspended|已冻结|已凍結/i, { timeout: 20000 }).should('be.visible');
	});
});

describe('After user signed in', () => {
	beforeEach(() => {
		cy.resetState();

		// インスタンス初期セットアップ
		cy.registerUser('admin', 'pass', true);

		// ユーザー作成
		cy.registerUser('alice', 'alice1234');

		cy.login('alice', 'alice1234');
	});

	afterEach(() => {
		// テスト終了直前にページ遷移するようなテストケース(例えばアカウント作成)だと、たぶんCypressのバグでブラウザの内容が次のテストケースに引き継がれてしまう(例えばアカウントが作成し終わった段階からテストが始まる)。
		// waitを入れることでそれを防止できる
		cy.wait(1000);
	});

  it('successfully loads', () => {
		// 表示に時間がかかるのでデフォルト秒数だとタイムアウトする
		cy.get('[data-cy-user-setup-continue]', { timeout: 30000 }).should('be.visible');
  });

	it('account setup wizard', () => {
		// 表示に時間がかかるのでデフォルト秒数だとタイムアウトする
		cy.get('[data-cy-user-setup-continue]', { timeout: 30000 }).click();

		cy.get('[data-cy-user-setup-user-name] input').type('ありす');
		cy.get('[data-cy-user-setup-user-description] textarea').type('ほげ');
		// TODO: アイコン設定テスト

		cy.get('[data-cy-user-setup-continue]').click();

		// プライバシー設定

		cy.get('[data-cy-user-setup-continue]').click();

		// フォローはスキップ

		cy.get('[data-cy-user-setup-continue]').click();

		// プッシュ通知設定はスキップ

		cy.get('[data-cy-user-setup-continue]').click();

		cy.get('[data-cy-user-setup-continue]').click();
  });
});

describe('After user setup', () => {
	beforeEach(() => {
		cy.resetState();

		// インスタンス初期セットアップ
		cy.registerUser('admin', 'pass', true);

		// ユーザー作成
		cy.registerUser('alice', 'alice1234');

		cy.login('alice', 'alice1234');

		// アカウント初期設定ウィザード
		// 表示に時間がかかるのでデフォルト秒数だとタイムアウトする
		cy.get('[data-cy-user-setup] [data-cy-modal-window-close]', { timeout: 30000 }).click();
		cy.get('[data-cy-modal-dialog-ok]').click();
	});

	afterEach(() => {
		// テスト終了直前にページ遷移するようなテストケース(例えばアカウント作成)だと、たぶんCypressのバグでブラウザの内容が次のテストケースに引き継がれてしまう(例えばアカウントが作成し終わった段階からテストが始まる)。
		// waitを入れることでそれを防止できる
		cy.wait(1000);
	});

	it('note', () => {
		cy.get('[data-cy-open-post-form]').should('be.visible');
		cy.get('[data-cy-open-post-form]').click();
		cy.get('[data-cy-post-form-text]').type('Hello, Misskey!');
		cy.get('[data-cy-open-post-form-submit]').click();

		cy.contains('Hello, Misskey!', { timeout: 15000 });
  });

	it('open note form with hotkey', () => {
		// Wait until the page loads
		cy.get('[data-cy-open-post-form]').should('be.visible');
		// Use trigger() to give different `code` to test if hotkeys also work on non-QWERTY keyboards.
		cy.document().trigger("keydown", { eventConstructor: 'KeyboardEvent', key: "n", code: "KeyL" });
		// See if the form is opened
		cy.get('[data-cy-post-form-text]').should('be.visible');
		// Close it
		cy.focused().trigger("keydown", { eventConstructor: 'KeyboardEvent', key: "Escape", code: "Escape" });
		// See if the form is closed
		cy.get('[data-cy-post-form-text]').should('not.be.visible');
  });
});

// TODO: 投稿フォームの公開範囲指定のテスト
// TODO: 投稿フォームのファイル添付のテスト
// TODO: 投稿フォームのハッシュタグ保持フィールドのテスト
