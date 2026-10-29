| Behaviour | Model | Clips | Pangtis | WER % | CER % | CER edge-tolerant % (per-clip avg) | edge-tolerant vs Karanbir (95% CI) |
|---|---|---|---|---|---|---|---|
| Kirtan, hall laptop mic (GAB-Hard) | karanbir | 7 | 81 | 168.8 | 118.0 | 53.5 (52.1) | baseline |
| Kirtan, hall laptop mic (GAB-Hard) | jaspal-v0 | 7 | 81 | 130.1 | 92.5 | 70.6 (69.5) | +17.1 [14.8, 20.2] clear |
| Kirtan, hall laptop mic (GAB-Hard) | jaspal-v1 | 7 | 81 | 186.9 | 122.7 | 66.1 (65.4) | +12.6 [9.6, 16.8] clear |
| Kirtan, hall laptop mic (GAB-Hard) | jaspal-v2 | 7 | 81 | 170.2 | 118.2 | 60.4 (58.5) | +6.9 [3.8, 9.7] clear |
| Paath (studio) | karanbir | 2 | 43 | 76.7 | 46.1 | 27.1 (26.9) | baseline |
| Paath (studio) | jaspal-v0 | 2 | 43 | 94.0 | 65.0 | 52.0 (52.1) | too few clips |
| Paath (studio) | jaspal-v1 | 2 | 43 | 89.4 | 59.1 | 44.5 (44.6) | too few clips |
| Paath (studio) | jaspal-v2 | 2 | 43 | 73.0 | 48.4 | 30.2 (30.1) | too few clips |
| Bani sung as kirtan | karanbir | 1 | 44 | 84.6 | 48.1 | 35.6 (35.6) | baseline |
| Bani sung as kirtan | jaspal-v0 | 1 | 44 | 97.9 | 73.4 | 69.2 (69.2) | too few clips |
| Bani sung as kirtan | jaspal-v1 | 1 | 44 | 93.2 | 64.4 | 57.6 (57.6) | too few clips |
| Bani sung as kirtan | jaspal-v2 | 1 | 44 | 82.9 | 51.6 | 39.8 (39.8) | too few clips |
| Akhand Paath (natural speed) | karanbir | 4 | 269 | 63.2 | 32.4 | 14.6 (14.5) | baseline |
| Akhand Paath (natural speed) | jaspal-v0 | 4 | 269 | 57.6 | 32.6 | 18.7 (18.5) | +4.1 [1.9, 6.2] too few clips to call |
| Akhand Paath (natural speed) | jaspal-v1 | 4 | 269 | 52.1 | 28.5 | 14.4 (14.2) | -0.2 [-2.2, 1.4] too few clips to call |
| Akhand Paath (natural speed) | jaspal-v2 | 4 | 269 | 51.0 | 29.5 | 12.5 (12.2) | -2.0 [-3.7, -0.0] too few clips to call |
| Akhand Paath sped up 1.35x (synthetic; one clip repeats a natural-speed clip) | karanbir | 2 | 179 | 75.9 | 44.1 | 23.7 (24.1) | baseline |
| Akhand Paath sped up 1.35x (synthetic; one clip repeats a natural-speed clip) | jaspal-v0 | 2 | 179 | 80.2 | 51.2 | 42.0 (42.8) | too few clips |
| Akhand Paath sped up 1.35x (synthetic; one clip repeats a natural-speed clip) | jaspal-v1 | 2 | 179 | 77.4 | 46.2 | 36.2 (36.8) | too few clips |
| Akhand Paath sped up 1.35x (synthetic; one clip repeats a natural-speed clip) | jaspal-v2 | 2 | 179 | 73.7 | 45.3 | 30.4 (30.7) | too few clips |

Edge-tolerant CER is the headline; plain WER / CER on exact label times count repeated singing and late captions as errors. Only behaviours with human or broadcast-caption pangti times appear: kirtan (mixer feed), Akhand Kirtan and paath (hall) have only model-aligned times, so they are left out. Rows with 1-2 clips are examples, not evidence. Pangtis are scored inside the same [start, end] of each clip as hit@5, so the longer recordings contribute only that part. Pangtis over 20 s (39 of 81 on hall kirtan) are cut into equal parts for every model.
