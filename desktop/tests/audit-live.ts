// Explicitly fictional public-network acceptance. No filesystem profile inputs.
import { search } from '../electron/search';
import { emptyProfiles } from '../electron/profiles';
async function main() {
  if (process.argv.slice(2).length) throw Error('This harness accepts no user profiles or database paths.');
  const profiles = emptyProfiles();
  Object.assign(profiles.job, {enabled: true, jobTitleKeywords: 'librarian', locations: [{city: 'Oslo', country: 'Norway'}]});
  Object.assign(profiles.vc, {enabled: true, productKeywords: 'agriculture', targetCountries: 'Japan'});
  for (const mode of ['job', 'vc'] as const) {
    let count = 0;
    await search(mode, [], profiles[mode], () => {}, () => { count++; });
    console.log(JSON.stringify({mode, fictional: true, count}));
  }
}
main().catch(() => { console.error('Fictional network acceptance failed'); process.exitCode = 1; });
