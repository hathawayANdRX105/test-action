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
	}).its('body').as(username);

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

Cypress.Commands.add('login', (username, password) => {
	cy.visitHome();

	cy.intercept('POST', '/api/signin-flow').as('signin');

	cy.get('[data-cy-signin]', { timeout: 30000 }).click();
	cy.get('[data-cy-signin-page-input]', { timeout: 10000 }).should('be.visible');
	cy.get('[data-cy-signin-username] input').type(`${username}{enter}`);
	cy.get('[data-cy-signin-page-password]', { timeout: 30000 }).should('be.visible');
	cy.get('[data-cy-signin-password] input').type(`${password}{enter}`);

	cy.wait('@signin').as('signedIn');
});
