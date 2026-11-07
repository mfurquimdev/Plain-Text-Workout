Weights combined with repetition
- Loaded Back Extension 10x23kg, 10x23kg, 10x23kg

Weight first and then number of repetitions
- Loaded Back Extension 23kg 10 10 10
This is equal to 10x23kg, 10x23kg, 10x23kg

Repeating same series
- Horizontal Leg Press 12x63kg^2 12x150lbs^2
- Horizontal Leg Press 12x63kg*2 12x150lbs*2
These are equal to 12x63kg, 12x63kg, 12x150lbs, 12x155lbs

Incremental weight
- Horizontal Leg Press 63kg++5lbs 12 12 8 7
This is equal to 12x63kg, 12x145lbs, 8x150lbs, 7x155lbs

It can be combined
- Horizontal Leg Press 63kg++5lbs 12^2 8 7
This is equal to 12x63kg, 12x145lbs, 8x150lbs, 7x155lbs

It cannot have an incremental with explicit serie in between. As soon as you define a serie with 
- Seated Leg Curl 36kg+2.5lbs 10 8 6x82.5lb

If you want to specify the machine, use the `@` symbol
- Calf Raise @Step Up Machine 24x54kg 20x54kg 18x54kg

If there's an initial weight, you can place it at the beginning - e.g., the initial weight of the machine
- Leg Press 45º +167lbs 10x40kg 12x50kg 12x60kg 10x70kg

Specify whether you are referring to the entire load or just one side - e.g., the following will turn into a full work load of 12x16kg 10x16 9x16kg
- Biceps Curl x2 12x8kg 10x8kg 9x8kg

You may combine it with initial weight as well - e.g., the following will turn into a full work load of 15x22kg 12x32kg 10x42kg
- Bench Press +22kg x2 15x0kg 12x5kg 10x10kg

If there's an initial weight, you can place it at the beginning - e.g., the initial weight of the Olympic bar
- Bench Press +22kg x2 15x0kg 12x5kg 10x10kg

You may specify per-side repetition for unilateral exercises, separated by a forward slash `/`, left and then right - e.g., left/right, 12/11.
- SL7026 Leg Curl Unilateral x2 15kg 12/12 12/11


Super set - i.e., alternated exercises - can be specified by a label withou bullet points. The app will highlight it using emphasis (italics)
_Lat Pulldown Super Set_
- Pronated Wide 39kg++5lbs 15 12 9
- Supinated Close 39kg++5lbs 15 12 9

Just play with css styling to get transparent background on input field, buttons and drop down selection.



2026-10-27
18h15~19h15
_Lat Pulldown Super Set_
+ Pronated Wide 39kg++5lbs 12^3
+ Supinated Close 39kg++5lbs 12^3
- Pec Fly 39kg 12^3
- Rear Delt 32kg 12^3
- Chin Assisted BW-36Kg 12^3
- Treadmill 1.57km 20min@4.7km/h 4.5~15⁰
Inclined Crunch BW 12 9