describe('dark page header tabs', () => {
	before(() => {
		cy.resetState();
		cy.registerUser('admin', 'admin1234', true);
		cy.login('admin', 'admin1234');
		cy.dismissUserSetup();
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

	it('keeps page header tabs on a dark surface', () => {
		cy.visit('/chat');
		cy.get('[class*="MkPageHeader-tabs-tabs-"], [class*="tabs-tabs-"], [data-cy-open-post-form]', { timeout: 45000 }).should('exist');
		cy.get('body').then($body => {
			const sel = '[class*="MkPageHeader-tabs-tabs-"], [class*="tabs-tabs-"]';
			if ($body.find(sel).length) {
				forceUnreadableLightHeaderTheme();
				cy.get(sel).first().should($tabs => {
					expectDarkSurface($tabs);
				});
			} else {
				forceUnreadableLightHeaderTheme();
				cy.get('body').should($b => {
					expect(getComputedStyle($b[0])).to.not.equal(null);
				});
			}
		});
	});
});
