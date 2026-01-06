const val = "119.0 (10-250)";
const match = val.match(/^([\d\.]+)\s*(\([^\)]+\))/);

console.log('String:', val);
if (match) {
    console.log('Match found!');
    console.log('Group 1:', match[1]);
    console.log('Group 2:', match[2]);
    console.log('Result:', `${match[1]} ${match[2]}`);
} else {
    console.log('No match.');
}

const val2 = "50 (10-70) TAPA CERRADA";
const match2 = val2.match(/^([\d\.]+)\s*(\([^\)]+\))/);
console.log('\nString 2:', val2);
if (match2) {
    console.log('Result 2:', `${match2[1]} ${match2[2]}`);
} else {
    console.log('No match 2.');
}
