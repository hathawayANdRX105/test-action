// ***********************************************
// Custom Cypress commands for Universe Federation
// ***********************************************

Cypress.Commands.add('visitHome', () => {
	cy.visit('/');
	cy.get('button', { timeout: 30000 }).should('be.visible');
});

Cypress.Commands.add('resetState', () => {
	// Wipe DB first, then force a clean client origin paint (visitor/setup UI).
	cy.request('POST', '/api/reset-db', {}).as('reset');
	cy.get('@reset').its('status').should('equal', 204);
	cy.clearCookies();
	cy.visit('/', {
		onBeforeLoad(win) {
			win.localStorage.clear();
			win.sessionStorage.clear();
			try {
				win.localStorage.removeItem('account');
				win.localStorage.removeItem('instance');
				win.localStorage.removeItem('instanceCachedAt');
			} catch { /* ignore */ }
		},
	});
	// Setup wizard (no root user) or visitor dashboard (after admin exists)
	cy.get('[data-cy-admin-username], [data-cy-signup]', { timeout: 30000 }).should('be.visible');
});

Cypress.Commands.add('registerUser', (username, password, isAdmin = false) => {
	const route = isAdmin ? '/api/admin/accounts/create' : '/api/signup';

	cy.request('POST', route, {
		username: username,
		password: password,
		...(isAdmin ? { setupPassword: 'example_password_please_change_this_or_you_will_get_hacked' } : {}),
	}).then((res) => {
		expect(res.status).to.be.oneOf([200, 204]);
		expect(res.body, `register ${username} body`).to.be.an('object');
		expect(res.body.id, `register ${username} id`).to.be.a('string');
		// alias full body (includes token for admin/signup)
		cy.wrap(res.body).as(username);
	});

	// First admin flips requireSetup; wait until API reflects it before visiting UI.
	if (isAdmin) {
		const deadline = Date.now() + 15000;
		const poll = (): Cypress.Chainable => cy.request('POST', '/api/meta', { detail: true }).then((res) => {
			if (res.body.requireSetup === false) return;
			if (Date.now() > deadline) {
				expect(res.body.requireSetup, 'requireSetup after admin create').to.eq(false);
				return;
			}
			return cy.wait(250).then(poll);
		});
		poll();
	}
});

// API login — UI multi-step is flaky; captcha is skipped when NODE_ENV=test.
Cypress.Commands.add('login', (username, password) => {
	const attempt = (n: number): Cypress.Chainable => {
		return cy.request({
			method: 'POST',
			url: '/api/signin-flow',
			body: { username, password },
			failOnStatusCode: false,
		}).then((res) => {
			if (res.status === 429 && n < 5) {
				return cy.wait(1500).then(() => attempt(n + 1));
			}
			// Finished in one shot (no 2FA / captcha required under NODE_ENV=test)
			if (res.status === 200 && res.body?.finished === true && res.body?.i) {
				return cy.wrap(res.body);
			}
			// Multi-step fallback: username-only then password
			if (res.status === 200 && res.body?.finished === false) {
				return cy.request({
					method: 'POST',
					url: '/api/signin-flow',
					body: { username, password },
					failOnStatusCode: false,
				}).then((res2) => {
					if (res2.status === 429 && n < 5) {
						return cy.wait(1500).then(() => attempt(n + 1));
					}
					expect(res2.status, `signin step2 status for ${username}`).to.eq(200);
					expect(res2.body.finished, 'signin finished').to.eq(true);
					return cy.wrap(res2.body);
				});
			}
			expect(res.status, `signin status for ${username}: ${JSON.stringify(res.body)}`).to.eq(200);
			expect(res.body.finished, 'signin finished').to.eq(true);
			return cy.wrap(res.body);
		});
	};

	attempt(0).then((body: { i: string }) => {
		const token = body.i;
		expect(token).to.be.a('string');
		return cy.request({
			method: 'POST',
			url: '/api/i',
			headers: { Authorization: `Bearer ${token}` },
			body: {},
		}).then((meRes) => {
			expect(meRes.status).to.eq(200);
			const account = { ...meRes.body, token };
			return cy.visit('/', {
				onBeforeLoad(win) {
					win.localStorage.clear();
					win.sessionStorage.clear();
					win.localStorage.setItem('account', JSON.stringify(account));
				},
			});
		});
	}).then(() => {
		cy.get('[data-cy-user-setup-continue], [data-cy-open-post-form], [data-cy-user-setup]', { timeout: 30000 }).should('exist');
	});
});

// Close account setup wizard + confirmation dialog if present.
Cypress.Commands.add('dismissUserSetup', () => {
	cy.get('body', { timeout: 30000 }).should('be.visible');
	// Setup wizard close
	cy.get('body').then(($body) => {
		if ($body.find('[data-cy-user-setup] [data-cy-modal-window-close]').length) {
			cy.get('[data-cy-user-setup] [data-cy-modal-window-close]', { timeout: 30000 }).click({ force: true });
		}
	});
	// Confirm "leave setup?" style dialogs
	cy.get('body').then(($body) => {
		if ($body.find('[data-cy-modal-dialog-ok]').length) {
			cy.get('[data-cy-modal-dialog-ok]').click({ force: true });
		}
	});
	// Any leftover modal windows (announcements, etc.)
	cy.get('body').then(($body) => {
		const closes = $body.find('[data-cy-modal-window-close]');
		if (closes.length) {
			cy.wrap(closes).each(($el) => {
				cy.wrap($el).click({ force: true });
			});
		}
	});
	cy.get('body').then(($body) => {
		if ($body.find('[data-cy-modal-dialog-ok]').length) {
			cy.get('[data-cy-modal-dialog-ok]').click({ force: true });
		}
	});
	// Wait until overlays that cover the post button are gone
	cy.get('[data-cy-user-setup]', { timeout: 15000 }).should('not.exist');
	cy.get('[data-cy-modal-dialog-ok]').should('not.exist');
	// MkModalWindow header should not remain covering the page
	cy.get('.MkModalWindow-header, [class*="MkModalWindow-header"]', { timeout: 10000 }).should('not.exist');
});
