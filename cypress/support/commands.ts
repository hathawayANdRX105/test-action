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
	// Clear client auth/session so visitor dashboard (data-cy-signup) is shown.
	cy.clearCookies();
	cy.clearLocalStorage();
	cy.window().then((win) => {
		try { win.sessionStorage.clear(); } catch { /* ignore */ }
	});
	cy.request('POST', '/api/reset-db', {}).as('reset');
	cy.get('@reset').its('status').should('equal', 204);
	// Wait for DI meta reseed + metaUpdated to settle
	cy.wait(500);
	cy.visit('/');
	cy.get('button', { timeout: 30000 }).should('be.visible');
});

Cypress.Commands.add('registerUser', (username, password, isAdmin = false) => {
	const route = isAdmin ? '/api/admin/accounts/create' : '/api/signup';

	cy.request('POST', route, {
		username: username,
		password: password,
		...(isAdmin ? { setupPassword: 'example_password_please_change_this_or_you_will_get_hacked' } : {}),
	}).its('body').as(username);
});

Cypress.Commands.add('login', (username, password) => {
	cy.visitHome();

	cy.intercept('POST', '/api/signin-flow').as('signin');

	cy.get('[data-cy-signin]').click();
	cy.get('[data-cy-signin-page-input]').should('be.visible', { timeout: 1000 });
	cy.get('[data-cy-signin-username] input').type(`${username}{enter}`);
	cy.get('[data-cy-signin-page-password]').should('be.visible', { timeout: 10000 });
	cy.get('[data-cy-signin-password] input').type(`${password}{enter}`);

	cy.wait('@signin').as('signedIn');
});
