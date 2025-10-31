// Script to add OG members
// Run this in the browser console when the app is open

const ogUsernames = [
    "parisite", "gymbro1534", "papaswampz", "sinasyndrome", "lennzio", "learn2ligma", "air groove",
    "deandabz", "babygodess", "crazymudo", "oceanfartin", "gg u t s", "kets0416", "k evin", "enyzo",
    "brokeboyroy", "guan you", "no purple", "ass activity", "pua best", "mr d white", "hardnoble",
    "gonzo1icious", "riabetic", "trilbybingus", "ilene ulich", "lady diah", "dudewithjob", "ninjadad",
    "jaddle", "ironninjadad", "rathza", "majinbuballz", "yung bloood", "chubbyscrubs", "meinxie",
    "vanilflu", "runrcrepeat", "daddy thighz", "baughmania", "lokeirah", "storebruuno", "bellyquiver",
    "kaijuocho", "hard r iron", "latinagyat", "im dia", "horntaildr18"
];

// Function to add all OG members
function addAllOgMembers() {
    if (!clanData || !clanData.memberships) {
        console.error('Clan data not loaded yet. Please wait for the data to load.');
        return;
    }

    let addedCount = 0;
    const normalizedOgUsernames = ogUsernames.map(name => name.toLowerCase());

    clanData.memberships.forEach(member => {
        const username = member.player.username.toLowerCase();
        if (normalizedOgUsernames.includes(username)) {
            if (!ogMembers.has(member.player.id)) {
                ogMembers.add(member.player.id);
                addedCount++;
                console.log(`Added OG: ${member.player.displayName}`);
            }
        }
    });

    saveSettings();
    displayMembers();

    console.log(`✓ Added ${addedCount} new OG members!`);
    console.log(`Total OG members: ${ogMembers.size}`);
}

// Run the function
addAllOgMembers();
