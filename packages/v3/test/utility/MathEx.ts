import Contracts from '../../components/Contracts';
import { TestMathEx } from '../../typechain';
import {
    floorSqrt,
    ceilSqrt,
    productRatio,
    reducedRatio,
    normalizedRatio,
    accurateRatio,
    roundDiv,
    mulDivC,
    mulDivF
} from '../helpers/MathUtils';
import { Fraction, toBigNumber, toString, toUint512, fromUint512 } from '../helpers/Types';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

const MAX_UINT128 = new Decimal(2).pow(128).sub(1);
const MAX_UINT256 = new Decimal(2).pow(256).sub(1);
const SCALES = [6, 18, 30].map((n) => new Decimal(10).pow(n)).concat(MAX_UINT128);
const PR_TEST_ARRAY = [MAX_UINT128, MAX_UINT256.divToInt(2), MAX_UINT256.sub(MAX_UINT128), MAX_UINT256];
const PR_MAX_ERROR = new Decimal('0.00000000000000000000000000000000000001');

const BN_TEST_ARRAY = [
    BigNumber.from(0),
    BigNumber.from(100),
    BigNumber.from(10000),
    ...PR_TEST_ARRAY.map((x) => BigNumber.from(x.toFixed()))
];

describe('MathEx', () => {
    let mathContract: TestMathEx;

    before(async () => {
        mathContract = await Contracts.TestMathEx.deploy();
    });

    const testFloorSqrt = (n: number, k: number) => {
        const x = BigNumber.from(2).pow(BigNumber.from(n)).add(BigNumber.from(k));
        it(`floorSqrt(${x.toHexString()})`, async () => {
            const expected = floorSqrt(x);
            const actual = await mathContract.floorSqrt(x);
            expect(actual).to.equal(expected);
        });
    };

    const testCeilSqrt = (n: number, k: number) => {
        const x = BigNumber.from(2).pow(BigNumber.from(n)).add(BigNumber.from(k));
        it(`ceilSqrt(${x.toHexString()})`, async () => {
            const expected = ceilSqrt(x);
            const actual = await mathContract.ceilSqrt(x);
            expect(actual).to.equal(expected);
        });
    };

    const testNegToPos = (n: BigNumber) => {
        const expected = n.mul(-1);
        it(`negToPos(${n.toHexString()}) should return ${expected.toHexString()}`, async () => {
            const actual = await mathContract.negToPos(n);
            expect(actual).to.equal(expected);
        });
    };

    const testUintAddInt = (x: BigNumber, y: BigNumber) => {
        const expected = x.add(y);
        if (expected.lte(BigNumber.from(2).pow(256).add(-1)) && expected.gte(BigNumber.from(0))) {
            it(`uintAddInt(${x.toHexString()}, ${y.toHexString()}) should return ${expected.toHexString()}`, async () => {
                const actual = await mathContract.uintAddInt(x, y);
                expect(actual).to.equal(expected);
            });
        } else {
            it(`uintAddInt(${x.toHexString()}, ${y.toHexString()}) should revert`, async () => {
                await expect(mathContract.uintAddInt(x, y)).to.be.revertedWith('panic code');
            });
        }
    };

    const testUintSubInt = (x: BigNumber, y: BigNumber) => {
        const expected = x.sub(y);
        if (expected.lte(BigNumber.from(2).pow(256).add(-1)) && expected.gte(BigNumber.from(0))) {
            it(`uintSubInt(${x.toHexString()}, ${y.toHexString()}) should return ${expected.toHexString()}`, async () => {
                const actual = await mathContract.uintSubInt(x, y);
                expect(actual).to.equal(expected);
            });
        } else {
            it(`uintSubInt(${x.toHexString()}, ${y.toHexString()}) should revert`, async () => {
                await expect(mathContract.uintSubInt(x, y)).to.be.revertedWith('panic code');
            });
        }
    };

    const testProductRatio = (x: Fraction, y: Fraction, maxAbsoluteError: Decimal, maxRelativeError: Decimal) => {
        it(`productRatio(${toString(x)}, ${toString(y)}`, async () => {
            const expected = productRatio(x, y);
            const actual = await mathContract.productRatio(toBigNumber(x), toBigNumber(y));
            expect(expected).to.almostEqual({ n: actual[0], d: actual[1] }, { maxAbsoluteError, maxRelativeError });
        });
    };

    const testReducedRatio = (r: Fraction, scale: Decimal, maxAbsoluteError: Decimal, maxRelativeError: Decimal) => {
        it(`reducedRatio(${toString(r)}, ${scale.toString()}})`, async () => {
            const expected = reducedRatio(r, scale);
            const actual = await mathContract.reducedRatio(toBigNumber(r), toBigNumber(scale));
            expect(expected).to.almostEqual({ n: actual[0], d: actual[1] }, { maxAbsoluteError, maxRelativeError });
        });
    };

    const testNormalizedRatio = (r: Fraction, scale: Decimal, maxAbsoluteError: Decimal, maxRelativeError: Decimal) => {
        it(`normalizedRatio(${toString(r)}, ${scale.toString()}})`, async () => {
            const expected = normalizedRatio(r, scale);
            const actual = await mathContract.normalizedRatio(toBigNumber(r), toBigNumber(scale));
            expect(expected).to.almostEqual({ n: actual[0], d: actual[1] }, { maxAbsoluteError, maxRelativeError });
        });
    };

    const testAccurateRatio = (r: Fraction, scale: Decimal, maxAbsoluteError: Decimal, maxRelativeError: Decimal) => {
        it(`accurateRatio(${toString(r)}, ${scale.toString()}})`, async () => {
            const expected = accurateRatio(r, scale);
            const actual = await mathContract.accurateRatio(toBigNumber(r), toBigNumber(scale));
            expect(expected).to.almostEqual({ n: actual[0], d: actual[1] }, { maxAbsoluteError, maxRelativeError });
        });
    };

    const testRoundDiv = (x: Decimal, y: Decimal) => {
        const [n, d] = [x, y].map((val) => val.toFixed());
        it(`roundDiv(${n}, ${d})`, async () => {
            const expected = roundDiv(n, d);
            const actual = await mathContract.roundDiv(n, d);
            expect(actual).to.equal(expected);
        });
    };

    type MulDivFunction = 'mulDivC' | 'mulDivF';
    const testMulDiv = (methodName: MulDivFunction, x: Decimal, y: Decimal, z: Decimal) => {
        const [a, b, c] = [x, y, z].map((val) => val.toHex());
        it(`${methodName}(${[a, b, c]})`, async () => {
            const expected = (methodName === 'mulDivC' ? mulDivC : mulDivF)(a, b, c);
            if (expected.lte(MAX_UINT256)) {
                const actual = await mathContract[methodName](a, b, c);
                expect(actual).to.equal(expected);
            } else {
                await expect(mathContract[methodName](a, b, c)).to.be.revertedWith('Overflow');
            }
        });
    };

    const testSubMax0 = (x: BigNumber, y: BigNumber) => {
        it(`subMax0(${x}, ${y})`, async () => {
            const expected = BigNumber.max(x.sub(y), BigNumber.from(0));
            const actual = await mathContract.subMax0(x, y);
            expect(actual).to.equal(expected);
        });
    };

    const testMul512 = (x: BigNumber, y: BigNumber) => {
        it(`mul512(${x}, ${y})`, async () => {
            const expected = x.mul(y);
            const actual = await mathContract.mul512(x, y);
            expect(fromUint512(actual.hi, actual.lo)).to.equal(expected);
        });
    };

    const testGT512 = (x: BigNumber, y: BigNumber) => {
        it(`gt512(${x}, ${y})`, async () => {
            const expected = x.gt(y);
            const actual = await mathContract.gt512(toUint512(x), toUint512(y));
            expect(actual).to.equal(expected);
        });
    };

    const testLT512 = (x: BigNumber, y: BigNumber) => {
        it(`lt512(${x}, ${y})`, async () => {
            const expected = x.lt(y);
            const actual = await mathContract.lt512(toUint512(x), toUint512(y));
            expect(actual).to.equal(expected);
        });
    };

    const testGTE512 = (x: BigNumber, y: BigNumber) => {
        it(`gte512(${x}, ${y})`, async () => {
            const expected = x.gte(y);
            const actual = await mathContract.gte512(toUint512(x), toUint512(y));
            expect(actual).to.equal(expected);
        });
    };

    const testLTE512 = (x: BigNumber, y: BigNumber) => {
        it(`lte512(${x}, ${y})`, async () => {
            const expected = x.lte(y);
            const actual = await mathContract.lte512(toUint512(x), toUint512(y));
            expect(actual).to.equal(expected);
        });
    };

    describe('quick tests', () => {
        for (const n of [1, 64, 128, 192, 256]) {
            for (const k of n < 256 ? [-1, 0, +1] : [-1]) {
                testFloorSqrt(n, k);
            }
        }

        for (const n of [1, 64, 128, 192, 256]) {
            for (const k of n < 256 ? [-1, 0, +1] : [-1]) {
                testCeilSqrt(n, k);
            }
        }

        for (const n of [0, 1, 2, 253, 254, 255]) {
            testNegToPos(BigNumber.from(2).pow(n).mul(-1));
        }

        for (const a of [0, 64, 127, 128, 255, 256]) {
            for (const b of [0, 64, 127, 128, 255]) {
                for (const m of [-1, 0, +1]) {
                    for (const n of [-1, 0, +1]) {
                        for (const s of [-1, +1]) {
                            const x = BigNumber.from(2).pow(a).add(m);
                            const y = BigNumber.from(2).pow(b).add(n).mul(s);
                            if (
                                x.gte(BigNumber.from(0)) &&
                                x.lte(BigNumber.from(2).pow(256).add(-1)) &&
                                y.lte(BigNumber.from(2).pow(255).add(-1)) &&
                                y.gte(BigNumber.from(2).pow(255).mul(-1))
                            ) {
                                testUintAddInt(x, y);
                                testUintSubInt(x, y);
                            }
                        }
                    }
                }
            }
        }

        for (const xn of PR_TEST_ARRAY.slice(-2)) {
            for (const yn of PR_TEST_ARRAY.slice(-2)) {
                for (const xd of PR_TEST_ARRAY.slice(-2)) {
                    for (const yd of PR_TEST_ARRAY.slice(-2)) {
                        testProductRatio({ n: xn, d: xd }, { n: yn, d: yd }, new Decimal(0), PR_MAX_ERROR);
                    }
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 5; a++) {
                for (let b = 1; b <= 5; b++) {
                    testReducedRatio({ n: new Decimal(a), d: new Decimal(b) }, scale, new Decimal(0), new Decimal(0));
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 5; a++) {
                for (let b = 1; b <= 5; b++) {
                    testNormalizedRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal(0),
                        new Decimal('0.00000241')
                    );
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 5; a++) {
                for (let b = Math.max(a, 1); b <= 5; b++) {
                    testAccurateRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal(0),
                        new Decimal('0.0000024')
                    );
                }
            }
        }

        for (let n = 0; n < 5; n++) {
            for (let d = 1; d <= 5; d++) {
                testRoundDiv(new Decimal(n), new Decimal(d));
            }
        }

        for (const methodName of ['mulDivF', 'mulDivC']) {
            for (const px of [128, 192, 256]) {
                for (const py of [128, 192, 256]) {
                    for (const pz of [128, 192, 256]) {
                        for (const ax of [3, 5, 7]) {
                            for (const ay of [3, 5, 7]) {
                                for (const az of [3, 5, 7]) {
                                    const x = new Decimal(2).pow(px).divToInt(ax);
                                    const y = new Decimal(2).pow(py).divToInt(ay);
                                    const z = new Decimal(2).pow(pz).divToInt(az);
                                    testMulDiv(methodName as MulDivFunction, x, y, z);
                                }
                            }
                        }
                    }
                }
            }
        }

        for (const x of BN_TEST_ARRAY) {
            for (const y of BN_TEST_ARRAY) {
                testSubMax0(x, y);
                testMul512(x, y);
                testGT512(x, y);
                testLT512(x, y);
                testGTE512(x, y);
                testLTE512(x, y);
            }
        }
    });

    describe('@stress tests', () => {
        for (let n = 1; n <= 256; n++) {
            for (const k of n < 256 ? [-1, 0, +1] : [-1]) {
                testFloorSqrt(n, k);
            }
        }

        for (let n = 1; n <= 256; n++) {
            for (const k of n < 256 ? [-1, 0, +1] : [-1]) {
                testCeilSqrt(n, k);
            }
        }

        for (let n = 0; n <= 255; n++) {
            testNegToPos(BigNumber.from(2).pow(n).mul(-1));
        }

        for (const a of [0, 2, 63, 64, 127, 128, 191, 192, 255, 256]) {
            for (const b of [0, 2, 63, 64, 127, 128, 191, 192, 255]) {
                for (const m of [-1, 0, +1]) {
                    for (const n of [-1, 0, +1]) {
                        for (const s of [-1, +1]) {
                            const x = BigNumber.from(2).pow(a).add(m);
                            const y = BigNumber.from(2).pow(b).add(n).mul(s);
                            if (
                                x.gte(BigNumber.from(0)) &&
                                x.lte(BigNumber.from(2).pow(256).add(-1)) &&
                                y.lte(BigNumber.from(2).pow(255).add(-1)) &&
                                y.gte(BigNumber.from(2).pow(255).mul(-1))
                            ) {
                                testUintAddInt(x, y);
                                testUintSubInt(x, y);
                            }
                        }
                    }
                }
            }
        }

        for (const xn of PR_TEST_ARRAY) {
            for (const yn of PR_TEST_ARRAY) {
                for (const xd of PR_TEST_ARRAY) {
                    for (const yd of PR_TEST_ARRAY) {
                        testProductRatio({ n: xn, d: xd }, { n: yn, d: yd }, new Decimal(0), PR_MAX_ERROR);
                    }
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 10; a++) {
                for (let b = 1; b <= 10; b++) {
                    testReducedRatio({ n: new Decimal(a), d: new Decimal(b) }, scale, new Decimal(0), new Decimal(0));
                }
            }
        }

        for (const scale of SCALES) {
            for (let i = new Decimal(1); i.lte(scale); i = i.mul(10)) {
                const a = MAX_UINT256.divToInt(scale).mul(i).add(1);
                for (let j = new Decimal(1); j.lte(scale); j = j.mul(10)) {
                    const b = MAX_UINT256.divToInt(scale).mul(j).add(1);
                    testReducedRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal(0),
                        new Decimal('0.135')
                    );
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 10; a++) {
                for (let b = 1; b <= 10; b++) {
                    testNormalizedRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal(0),
                        new Decimal('0.00000241')
                    );
                }
            }
        }

        for (const scale of SCALES) {
            for (let i = new Decimal(1); i.lte(scale); i = i.mul(10)) {
                const a = MAX_UINT256.divToInt(scale).mul(i).add(1);
                for (let j = new Decimal(1); j.lte(scale); j = j.mul(10)) {
                    const b = MAX_UINT256.divToInt(scale).mul(j).add(1);
                    testNormalizedRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal(0),
                        new Decimal('0.135')
                    );
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 10; a++) {
                for (let b = Math.max(a, 1); b <= 10; b++) {
                    testAccurateRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal(0),
                        new Decimal('0.0000024')
                    );
                }
            }
        }

        for (const scale of SCALES) {
            for (let i = new Decimal(1); i.lte(scale); i = i.mul(10)) {
                const a = MAX_UINT256.divToInt(scale).mul(i).add(1);
                for (let j = new Decimal(i); j.lte(scale); j = j.mul(10)) {
                    const b = MAX_UINT256.divToInt(scale).mul(j).add(1);
                    testAccurateRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal(0),
                        new Decimal('0.135')
                    );
                }
            }
        }

        for (const scale of [1, 2, 3, 4].map((x) => new Decimal(x))) {
            for (const a of [
                MAX_UINT256.div(3).floor(),
                MAX_UINT256.div(3).ceil(),
                MAX_UINT256.div(2).floor(),
                MAX_UINT256.div(2).ceil(),
                MAX_UINT256.mul(2).div(3).floor(),
                MAX_UINT256.mul(2).div(3).ceil(),
                MAX_UINT256.mul(3).div(4).floor(),
                MAX_UINT256.mul(3).div(4).ceil(),
                MAX_UINT256.sub(1),
                MAX_UINT256
            ]) {
                for (const b of [MAX_UINT256.sub(1), MAX_UINT256].filter((b) => b.gt(a))) {
                    testAccurateRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal('1.6'),
                        new Decimal(0)
                    );
                }
            }
        }

        for (let n = 0; n < 10; n++) {
            for (let d = 1; d <= 10; d++) {
                testRoundDiv(new Decimal(n), new Decimal(d));
            }
        }

        for (const methodName of ['mulDivF', 'mulDivC']) {
            for (const px of [0, 64, 128, 192, 255, 256]) {
                for (const py of [0, 64, 128, 192, 255, 256]) {
                    for (const pz of [1, 64, 128, 192, 255, 256]) {
                        for (const ax of px < 256 ? [-1, 0, +1] : [-1]) {
                            for (const ay of py < 256 ? [-1, 0, +1] : [-1]) {
                                for (const az of pz < 256 ? [-1, 0, +1] : [-1]) {
                                    const x = new Decimal(2).pow(px).add(ax);
                                    const y = new Decimal(2).pow(py).add(ay);
                                    const z = new Decimal(2).pow(pz).add(az);
                                    testMulDiv(methodName as MulDivFunction, x, y, z);
                                }
                            }
                        }
                    }
                }
            }
        }

        for (const methodName of ['mulDivF', 'mulDivC']) {
            for (const px of [64, 128, 192, 256]) {
                for (const py of [64, 128, 192, 256]) {
                    for (const pz of [64, 128, 192, 256]) {
                        for (const ax of [new Decimal(2).pow(px >> 1), 1]) {
                            for (const ay of [new Decimal(2).pow(py >> 1), 1]) {
                                for (const az of [new Decimal(2).pow(pz >> 1), 1]) {
                                    const x = new Decimal(2).pow(px).sub(ax);
                                    const y = new Decimal(2).pow(py).sub(ay);
                                    const z = new Decimal(2).pow(pz).sub(az);
                                    testMulDiv(methodName as MulDivFunction, x, y, z);
                                }
                            }
                        }
                    }
                }
            }
        }

        for (const methodName of ['mulDivF', 'mulDivC']) {
            for (const px of [128, 192, 256]) {
                for (const py of [128, 192, 256]) {
                    for (const pz of [128, 192, 256]) {
                        for (const ax of [3, 5, 7]) {
                            for (const ay of [3, 5, 7]) {
                                for (const az of [3, 5, 7]) {
                                    const x = new Decimal(2).pow(px).divToInt(ax);
                                    const y = new Decimal(2).pow(py).divToInt(ay);
                                    const z = new Decimal(2).pow(pz).divToInt(az);
                                    testMulDiv(methodName as MulDivFunction, x, y, z);
                                }
                            }
                        }
                    }
                }
            }
        }
    });
});
