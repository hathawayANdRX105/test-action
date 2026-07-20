describe('dark page header tabs', () => {
	const username = 'admin';
	const password = 'admin1234';

	before(() => {
		cy.resetState();
		cy.registerUser(username, password, true);
	});

	const forceUnreadableLightHeaderTheme = () => {
		cy.window().then(win => {
			win.document.documentElement.dataset.colorScheme = 'dark';
			win.document.documentElement.style.setProperty('color-scheme', 'dark', 'important');
			win.document.documentElement.style.setProperty('--MI_THEME-bg', 'rgb(12, 18, 16)', 'important');
			win.document.documentElement.style.setProperty('--MI_THEME-pageHeaderBg', 'rgb(255, 255, 255)', 'important');
			win.document.documentElement.style.setProperty('--MI_THEME-pageHeaderFg', 'rgb(20, 20, 20)', 'important');
		});
	};

	const expectDarkSurface = ($el: JQuery<HTMLElement>) => {
		const style = getComputedStyle($el[0]);
		const rgb = style.backgroundColor.match(/\d+(?:\.\d+)?/g)!.slice(0, 3).map(Number);
		const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
		expect(luminance).to.be.lessThan(0.2);
	};

	const visitAsAdmin = (path: string) => {
		cy.request('POST', '/api/signin-flow', { username }).its('status').should('eq', 200);
		cy.request('POST', '/api/signin-flow', { username, password }).then(({ body: account }) => {
			expect(account.finished).to.eq(true);
			cy.request({
				method: 'POST',
				url: '/api/i',
				headers: { Authorization: `Bearer ${account.i}` },
				body: {},
			}).then((meRes) => {
				cy.visit(path, {
					onBeforeLoad(win) {
						win.localStorage.setItem('account', JSON.stringify({
							...meRes.body,
							token: account.i,
						}));
					},
				});
			});
		});
	};

	it('keeps chat home page header tabs on a dark surface', () => {
		visitAsAdmin('/chat');

		cy.get('[class*="MkPageHeader-tabs-tabs-"]', { timeout: 30000 }).should('be.visible');
		forceUnreadableLightHeaderTheme();

		cy.get('[class*="MkPageHeader-tabs-tabs-"]').should($tabs => {
			expectDarkSurface($tabs);
		});
	});

	it('keeps chat room local tabs on a dark surface', () => {
		visitAsAdmin('/chat/room/amp7n5mx98gq0001');

		cy.get('[data-chat-room-tabs]', { timeout: 30000 }).should('be.visible');
		forceUnreadableLightHeaderTheme();

		cy.get('[data-chat-room-tabs]').should($tabs => {
			expectDarkSurface($tabs);
		});
	});
});
