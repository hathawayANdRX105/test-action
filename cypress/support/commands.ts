// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })

Cypress.Commands.add('visitHome', () => {
	cy.visit('/');
	cy.get('button', { timeout: 30000 }).should('be.visible');
})

Cypress.Commands.add('resetState', () => {
	// Wipe DB first, then force a clean client origin paint (visitor/setup UI).
	cy.request('POST', '/api/reset-db', {}).as('reset');
	cy.get('@reset').its('status').should('equal', 204);
	cy.clearCookies();
	cy.visit('/', {
		onBeforeLoad(win) {
			win.localStorage.clear();
			win.sessionStorage.clear();
			// belt-and-suspenders: miLocalStorage keys that control UI
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
	cy.request('POST', '/api/signin-flow', { username, password }).then((res) => {
		expect(res.status).to.eq(200);
		expect(res.body.finished, 'signin finished').to.eq(true);
		const token = res.body.i as string;
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
					win.localStorage.setItem('account', JSON.stringify(account));
				},
			});
		});
	}).then(() => {
		cy.get('[data-cy-user-setup-continue], [data-cy-open-post-form]', { timeout: 30000 }).should('exist');
	});
});
